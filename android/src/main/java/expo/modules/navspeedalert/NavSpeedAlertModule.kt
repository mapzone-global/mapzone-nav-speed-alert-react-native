package expo.modules.navspeedalert

import android.graphics.Bitmap
import android.util.Base64
import com.vietmap.alert_view_sdk.AlertViewManager
import com.vietmap.alert_view_sdk.VoiceAlertType
import com.vietmap.alert_view_sdk.VoiceCallback
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Expo Module wrapping the native `AlertViewManager`. Function order mirrors
 * the native class and the Swift module so the three can be diffed side by side.
 *
 * `onSigns` / `onResult` / `onReroute` are always wired. `onRestriction` and
 * `onVoice` are wired only while JS has a listener, preserving native
 * semantics: restriction bitmaps are only rendered when a callback exists, and
 * the built-in voice player stays active until a voice callback is set.
 */
class NavSpeedAlertModule : Module() {
  private val mgr = AlertViewManager()

  override fun definition() = ModuleDefinition {
    Name("NavSpeedAlert")

    Events("onSigns", "onRestriction", "onVoice", "onResult", "onReroute")

    Class(AlertSignRef::class) {
      Function("toBase64") { ref: AlertSignRef -> ref.toPngBase64() }
    }

    OnCreate {
      mgr.setBitmapCallback { cur, status, next, nextDist, cam, camDist, toll, tollDist, _ ->
        sendEvent(
          "onSigns",
          mapOf(
            "current" to wrap(cur),
            "speedStatus" to status,
            "next" to wrap(next),
            "nextDistMeters" to nextDist,
            "camera" to wrap(cam),
            "cameraDistMeters" to camDist,
            "toll" to wrap(toll),
            "tollDistMeters" to tollDist,
          ),
        )
      }
      mgr.setResultCallback { ok, code, msg ->
        sendEvent("onResult", mapOf("success" to ok, "errorCode" to code, "errorMessage" to msg))
      }
      mgr.setRerouteCallback { lat, lng ->
        sendEvent("onReroute", mapOf("lat" to lat, "lng" to lng))
      }
    }

    OnStartObserving("onRestriction") {
      mgr.setRestrictionCallback { stop, stopD, closed, closedD, vehicle, vehicleD, bua, buaD, inBua, turn, turnD ->
        sendEvent(
          "onRestriction",
          mapOf(
            "stop" to wrap(stop),
            "stopDistMeters" to stopD,
            "closed" to wrap(closed),
            "closedDistMeters" to closedD,
            "vehicle" to wrap(vehicle),
            "vehicleDistMeters" to vehicleD,
            "bua" to wrap(bua),
            "buaDistMeters" to buaD,
            "inBua" to inBua,
            "turn" to wrap(turn),
            "turnDistMeters" to turnD,
          ),
        )
      }
    }
    OnStopObserving("onRestriction") { mgr.setRestrictionCallback(null) }

    OnStartObserving("onVoice") {
      // Explicit object, not a lambda: a SAM lambda would bind the 1-arg
      // overload and lose trigger/priority.
      mgr.setVoiceCallback(
        object : VoiceCallback {
          override fun onVoice(wavBytes: ByteArray) = onVoice(wavBytes, 0, 0)

          override fun onVoice(wavBytes: ByteArray, trigger: Int, priority: Int) {
            sendEvent(
              "onVoice",
              mapOf(
                "wavBase64" to Base64.encodeToString(wavBytes, Base64.NO_WRAP),
                "trigger" to trigger,
                "priority" to priority,
              ),
            )
          }
        },
      )
    }
    OnStopObserving("onVoice") { mgr.setVoiceCallback(null) }

    Function("configure") { o: ConfigureRecord ->
      mgr.configure(
        o.baseUrl, o.apiKeyId, o.apiKey, o.vehicleId,
        o.vehicleType, o.seats, o.weights, o.maxSnapMeters,
      )
    }
    Function("setSegmentUrl") { url: String -> mgr.setSegmentUrl(url) }
    Function("setExtraHeaders") { headers: Map<String, String> -> mgr.setExtraHeaders(headers) }
    Function("setExtraBodyFields") { fields: Map<String, String> -> mgr.setExtraBodyFields(fields) }
    Function("start") { polyline: String -> mgr.start(polyline) }
    Function("onLocation") { lat: Double, lng: Double, bearing: Double, speedKmh: Double, accuracy: Double, fixTimeMillis: Long ->
      mgr.onLocation(lat, lng, bearing, speedKmh, accuracy, fixTimeMillis)
    }
    Function("reset") { mgr.reset() }
    Function("setMutedAlertTypes") { codes: List<Int> ->
      mgr.setMutedAlertTypes(VoiceAlertType.values().filter { it.triggerValue in codes }.toSet())
    }
    // Async: these wait for the engine queue (a segment fetch can be in flight)
    // and must not stall the JS thread.
    AsyncFunction("canExportLogs") { mgr.canExportLogs() }
    AsyncFunction("exportLogs") { path: String -> mgr.exportLogs(path) }

    OnDestroy {
      // Callbacks are process-wide in the native bridge; drop them so a torn-down
      // module (JS reload) neither keeps the built-in player muted nor receives ticks.
      mgr.setBitmapCallback(null)
      mgr.setRestrictionCallback(null)
      mgr.setVoiceCallback(null)
      mgr.setResultCallback(null)
      mgr.setRerouteCallback(null)
      mgr.reset()
    }
  }

  private fun wrap(bitmap: Bitmap?): AlertSignRef? = bitmap?.let { AlertSignRef(it, runtime) }
}
