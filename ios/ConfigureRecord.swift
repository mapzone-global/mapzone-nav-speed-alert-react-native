import ExpoModulesCore

/// Mirrors `ConfigureOptions` in `src/NavSpeedAlert.types.ts`.
struct ConfigureRecord: Record {
  @Field(.required) var baseUrl: String = ""
  @Field(.required) var apiKeyId: String = ""
  @Field(.required) var apiKey: String = ""
  @Field(.required) var vehicleId: String = ""
  @Field(.required) var vehicleType: Int = 0
  @Field(.required) var seats: Int = 0
  @Field(.required) var weights: Double = 0
  @Field(.required) var maxSnapMeters: Double = 0
}
