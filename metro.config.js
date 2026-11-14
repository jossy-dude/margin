// Expo's default Metro config, plus `.ogg`: the v0.7 sounds are Ogg Vorbis (scripts/sounds/build.mjs) and Metro's
// default asset list has wav/mp3 but not ogg. (v0.5 had pushed `.riv` for a Rive mascot; that is gone.)
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('ogg');
module.exports = config;
