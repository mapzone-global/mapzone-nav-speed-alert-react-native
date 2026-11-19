import AlertViewSDK
import ExpoModulesCore
import UIKit

/// Expo Module wrapping the native `AlertViewManager`. Function order mirrors
/// the native class and the Kotlin module so the three can be diffed side by side.
///
/// `onSigns` / `onResult` / `onReroute` are always wired. `onRestriction` and
/// `onVoice` are wired only while JS has a listener, preserving native
/// semantics: restriction images are only rendered when a callback exists, and
/// the built-in voice player stays active until a voice callback is set.
///
/// Every function is synchronous on the JS thread: the native manager validates
/// on the caller's thread and queues the work on its own serial queue, so
/// `configure` / `logout` / `start` / `onLocation` reach native in the order JS
/// issued them. Native callbacks arrive on the main thread.
///
/// Events go through `emit(event:payload:)` (JSI), not `sendEvent`: the latter
/// still uses the legacy bridge emitter on iOS, which serializes the body and
/// drops `SharedObject` values such as `AlertSignRef`. The two sign events use
/// `Record` payloads for the same reason (see `EventPayloads.swift`); the
/// primitive-only events (`onResult`, `onReroute`, `onVoice`) keep dictionaries.
public class NavSpeedAlertModule: Module {
  private let mgr = AlertViewManager()

  public func definition() -> ModuleDefinition {
    Name("NavSpeedAlert")

    Events(
      "onSigns",
      "onRestriction",
      "onVoice",
      "onResult",
      "onReroute",
      // Internal: settles the JS promise of `logout()`, matched by requestId.
      "onLogoutResult"
    )

    Class(AlertSignRef.self) {
      Function("toBase64") { (ref: AlertSignRef) in ref.toPngBase64() }
    }

    OnCreate {
      mgr.setBitmapCallback { [weak self] cur, status, next, nextDist, cam, camDist, toll, tollDist in
        let payload = SignsPayload(
          current: cur, speedStatus: status, next: next, nextDistMeters: nextDist,
          camera: cam, cameraDistMeters: camDist, toll: toll, tollDistMeters: tollDist
        )
        self?.emit(event: "onSigns", payload: payload)
      }
      mgr.setResultCallback { [weak self] ok, code, msg in
        let payload: [String: Any?] = ["success": ok, "errorCode": code, "errorMessage": msg]
        self?.emit(event: "onResult", payload: payload)
      }
      mgr.setRerouteCallback { [weak self] lat, lng in
        let payload: [String: Any?] = ["lat": lat, "lng": lng]
        self?.emit(event: "onReroute", payload: payload)
      }
    }

    OnStartObserving("onRestriction") {
      mgr.setRestrictionCallback { [weak self] stop, stopD, closed, closedD, vehicle, vehicleD, bua, buaD, inBua, turn, turnD in
        let payload = RestrictionPayload(
          stop: stop, stopDistMeters: stopD, closed: closed, closedDistMeters: closedD,
          vehicle: vehicle, vehicleDistMeters: vehicleD, bua: bua, buaDistMeters: buaD,
          inBua: inBua, turn: turn, turnDistMeters: turnD
        )
        self?.emit(event: "onRestriction", payload: payload)
      }
    }
    OnStopObserving("onRestriction") { mgr.setRestrictionCallback(nil) }

    OnStartObserving("onVoice") {
      mgr.setVoiceCallback { [weak self] wav, trigger, priority in
        let payload: [String: Any?] = [
          "wavBase64": wav.base64EncodedString(),
          "trigger": trigger,
          "priority": priority,
        ]
        self?.emit(event: "onVoice", payload: payload)
      }
    }
    OnStopObserving("onVoice") { mgr.setVoiceCallback(nil) }

    // Returns nil when applied, otherwise the native reason (nothing applied).
    // JS has already checked `vehicleType` against `AlertVehicleType`.
    Function("configure") { (o: ConfigureRecord) throws -> String? in
      guard let vehicleType = AlertVehicleType(rawValue: o.vehicleType) else {
        throw UnknownVehicleTypeException(o.vehicleType)
      }
      return mgr.configure(
        baseUrl: o.baseUrl, apiKeyId: o.apiKeyId, apiKey: o.apiKey, identity: o.identity,
        vehicleType: vehicleType, seats: o.seats, weights: o.weightsTons,
        maxSnapMeters: o.maxSnapMeters, metadata: o.metadata
      )
    }
    // Queued behind any configure issued before it; the server answer comes
    // back on the main thread as `onLogoutResult` with the same requestId.
    Function("logout") { (requestId: Int) in
      mgr.logout { [weak self] success, errorCode, errorMessage in
        let payload: [String: Any?] = [
          "requestId": requestId, "success": success, "errorCode": errorCode,
          "errorMessage": errorMessage,
        ]
        self?.emit(event: "onLogoutResult", payload: payload)
      }
    }
    Function("setSegmentUrl") { (url: String) -> String? in mgr.setSegmentUrl(url) }
    Function("setExtraHeaders") { (headers: [String: String]) -> String? in mgr.setExtraHeaders(headers) }
    Function("setExtraBodyFields") { (fields: [String: String]) -> String? in mgr.setExtraBodyFields(fields) }
    Function("start") { (polyline: String) in mgr.start(polyline) }
    Function("onLocation") { (lat: Double, lng: Double, bearing: Double, speedKmh: Double, accuracy: Double, fixTimeMillis: Int64) in
      mgr.onLocation(lat: lat, lng: lng, bearing: bearing, speedKmh: speedKmh, accuracy: accuracy, fixTimeMillis: fixTimeMillis)
    }
    Function("reset") { mgr.reset() }
    Function("setMutedAlertTypes") { (codes: [Int]) in
      mgr.setMutedAlertTypes(Set(codes.compactMap(VoiceAlertType.init(rawValue:))))
    }
    Function("setVoiceMode") { (modeValue: Int) in
      mgr.setVoiceMode(VoiceMode(rawValue: modeValue) ?? .full)
    }
    Function("setVoiceSpeed") { (speed: Float) in mgr.setVoiceSpeed(speed) }
    // Async: these wait for the engine queue (a segment fetch can be in flight)
    // and must not stall the JS thread.
    AsyncFunction("canExportLogs") { () -> Bool in mgr.canExportLogs() }
    AsyncFunction("exportLogs") { (path: String) -> Int in mgr.exportLogs(toFile: path) }

    OnDestroy {
      // Drop every callback so a torn-down module (JS reload) neither keeps the
      // built-in player muted nor receives ticks.
      mgr.setBitmapCallback(nil)
      mgr.setRestrictionCallback(nil)
      mgr.setVoiceCallback(nil)
      mgr.setResultCallback(nil)
      mgr.setRerouteCallback(nil)
      mgr.reset()
    }
  }
}

/// `configure` received a code that is not a native `AlertVehicleType` case.
final class UnknownVehicleTypeException: GenericException<Int>, @unchecked Sendable {
  override var reason: String {
    "vehicleType must be an AlertVehicleType, got \(param)"
  }
}
