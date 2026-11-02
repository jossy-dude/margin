// Expo's default Metro config. (v0.5 had pushed `.riv` for a Rive mascot; Scrap is cut from paper bitmaps,
// `.webp`, which Metro bundles by default, so nothing is added here any more.)
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
