/** The one version string the app prints.
 *
 *  It used to print "Margin 1.0" in the export Summary and in Settings → Reset while `app.json` said
 *  `0.2.0` — two numbers, both wrong, and nothing tying either to a build. This is the number the app
 *  says out loud, and `src/test/version.test.ts` holds it equal to `expo.version` in `app.json` so the
 *  file and the screens cannot drift apart again. */
/** The app's name on screen (v0.7.6.1: Margin → Marrow — it lives inside the Bone vault and keeps the M). Internal
 *  identifiers (package, `app: 'margin'` in exports, the vault's `Margin/` notes and `.margin/`) keep the old name. */
export const APP_NAME = 'Marrow';
export const APP_VERSION = '0.7.8.5';
