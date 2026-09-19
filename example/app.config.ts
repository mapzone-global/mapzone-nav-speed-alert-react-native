import type { ExpoConfig } from 'expo/config';

// Credentials come from example/.env (see .env.example). Expo CLI loads .env
// into process.env before evaluating this file.
const env = (key: string, fallback = '') => process.env[key] ?? fallback;

const config: ExpoConfig = {
  name: 'NavSpeedAlert Example',
  slug: 'nav-speed-alert-example',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'expo.modules.navspeedalert.example',
    supportsTablet: false,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: 'Used to feed GPS fixes to the speed alert engine.',
    },
  },
  android: {
    package: 'expo.modules.navspeedalert.example',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
    predictiveBackGestureEnabled: false,
  },
  plugins: ['expo-dev-client', 'expo-location'],
  extra: {
    baseUrl: env('NAV_BASE_URL'),
    apiKeyId: env('NAV_API_KEY_ID'),
    apiKey: env('NAV_API_KEY'),
    vehicleId: env('NAV_VEHICLE_ID', '10'),
    vehicleType: Number(env('NAV_VEHICLE_TYPE', '1')),
    seats: Number(env('NAV_SEATS', '5')),
    weights: Number(env('NAV_WEIGHTS', '1.5')),
    maxSnapMeters: Number(env('NAV_MAX_SNAP_METERS', '0')),
    segmentUrl: env('NAV_SEGMENT_URL'),
  },
};

export default config;
