import ExpoModulesCore
import UIKit

// Event payloads are `Record`s, not `[String: Any?]`: a dictionary erases the
// value type to `Optional<Any>`, which Expo's JS converter cannot map (it logs
// `unknownToJavaScriptValue: unsupported native type 'Optional<Any>'` and
// sends `undefined`). A `@Field` typed `AlertSignRef?` goes through the
// SharedObject path and reaches JS as the registered class instance.

/// Mirrors `SignsEvent` in `src/NavSpeedAlert.types.ts`.
struct SignsPayload: Record {
  @Field var current: AlertSignRef?
  @Field var speedStatus: Int = 0
  @Field var next: AlertSignRef?
  @Field var nextDistMeters: Int = 0
  @Field var camera: AlertSignRef?
  @Field var cameraDistMeters: Int = 0
  @Field var toll: AlertSignRef?
  @Field var tollDistMeters: Int = 0

  init() {}

  init(
    current: UIImage?, speedStatus: Int, next: UIImage?, nextDistMeters: Int,
    camera: UIImage?, cameraDistMeters: Int, toll: UIImage?, tollDistMeters: Int
  ) {
    self.current = AlertSignRef.wrap(current)
    self.speedStatus = speedStatus
    self.next = AlertSignRef.wrap(next)
    self.nextDistMeters = nextDistMeters
    self.camera = AlertSignRef.wrap(camera)
    self.cameraDistMeters = cameraDistMeters
    self.toll = AlertSignRef.wrap(toll)
    self.tollDistMeters = tollDistMeters
  }
}

/// Mirrors `RestrictionEvent` in `src/NavSpeedAlert.types.ts`.
struct RestrictionPayload: Record {
  @Field var stop: AlertSignRef?
  @Field var stopDistMeters: Int = 0
  @Field var closed: AlertSignRef?
  @Field var closedDistMeters: Int = 0
  @Field var vehicle: AlertSignRef?
  @Field var vehicleDistMeters: Int = 0
  @Field var bua: AlertSignRef?
  @Field var buaDistMeters: Int = 0
  @Field var inBua: Bool = false
  @Field var turn: AlertSignRef?
  @Field var turnDistMeters: Int = 0

  init() {}

  init(
    stop: UIImage?, stopDistMeters: Int, closed: UIImage?, closedDistMeters: Int,
    vehicle: UIImage?, vehicleDistMeters: Int, bua: UIImage?, buaDistMeters: Int,
    inBua: Bool, turn: UIImage?, turnDistMeters: Int
  ) {
    self.stop = AlertSignRef.wrap(stop)
    self.stopDistMeters = stopDistMeters
    self.closed = AlertSignRef.wrap(closed)
    self.closedDistMeters = closedDistMeters
    self.vehicle = AlertSignRef.wrap(vehicle)
    self.vehicleDistMeters = vehicleDistMeters
    self.bua = AlertSignRef.wrap(bua)
    self.buaDistMeters = buaDistMeters
    self.inBua = inBua
    self.turn = AlertSignRef.wrap(turn)
    self.turnDistMeters = turnDistMeters
  }
}
