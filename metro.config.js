// Expo's default Metro config, plus `.riv` (Rive animation files) as a bundled asset — the onboarding
// mascot ships inside the app (assets/rive/), so a restyled file can still arrive later by OTA.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('riv');

module.exports = config;
