// Expo's default Metro config, plus `.ogg`: the v0.7 sounds are Ogg Vorbis (scripts/sounds/build.mjs) and Metro's
// default asset list has wav/mp3 but not ogg. (v0.5 had pushed `.riv` for a Rive mascot; that is gone.)
// v0.7.7 (SPEC §2 E7): `inlineRequires` — a module runs the first time something uses it, not when the bundle starts,
// so Stats, Grades, Focus and Onboarding (mounted on first visit) cost nothing before Today's first frame.
// Expo's own `experimentalImportSupport: true` is kept.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('ogg');
config.transformer.getTransformOptions = async () => ({
  transform: { experimentalImportSupport: true, inlineRequires: true },
});
module.exports = config;
