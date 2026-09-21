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
/// Events go through `emit(event:payload:)` (JSI), not `sendEvent`: the latter
/// still uses the legacy bridge emitter on iOS, which serializes the body and
/// drops `SharedObject` values such as `AlertSignRef`. The two sign events use
/// `Record` payloads for the same reason (see `EventPayloads.swift`); the
/// primitive-only events (`onResult`, `onReroute`, `onVoice`) keep dictionaries.
public class NavSpeedAlertModule: Module {
  private let mgr = AlertViewManager()

  public func definition() -> ModuleDefinition {
    Name("NavSpeedAlert")

    Events("onSigns", "onRestriction", "onVoice", "onResult", "onReroute")

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

    Function("configure") { (o: ConfigureRecord) in
      mgr.configure(
        baseUrl: o.baseUrl, apiKeyId: o.apiKeyId, apiKey: o.apiKey, vehicleId: o.vehicleId,
        vehicleType: o.vehicleType, seats: o.seats, weights: o.weights, maxSnapMeters: o.maxSnapMeters
      )
    }
    Function("setSegmentUrl") { (url: String) in mgr.setSegmentUrl(url) }
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
