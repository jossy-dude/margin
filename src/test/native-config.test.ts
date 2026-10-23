import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The APK is built from the committed `android/` folder, so `app.json` is NOT what ships.
 *
 * That is not a style preference: this project has a checked-in native project, which means
 * `npx expo prebuild` never runs during a build and none of the config plugins touch anything. The
 * `updates` block in `app.json`, the `version` string, the runtime version — all of it is inert at
 * build time and only true if the native files say the same thing.
 *
 * v0.3.1 shipped an `AndroidManifest.xml` that said `expo.modules.updates.ENABLED = false` with no
 * update URL while `app.json` said `enabled: true`: an updater that could never update, and one that
 * would have looked correct in every test and on every screen. These assertions exist so that class of
 * drift fails here instead of on the owner's phone, where it costs a build to discover.
 *
 * The expected native spellings are taken from `@expo/config-plugins`'s `AndroidConfig.Updates`
 * (`build/android/Updates.js`), which is what would write them — including `ON_LOAD → 'ALWAYS'`,
 * which is the one mapping no reader would guess.
 */

const ROOT = join(__dirname, '..', '..');
const ANDROID = join(ROOT, 'android');

/** The last `versionCode` that actually reached a phone. Bump when a build ships. */
const SHIPPED_VERSION_CODE = 2;

const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')) as {
  expo: {
    version: string;
    runtimeVersion?: { policy?: string } | string;
    updates?: {
      enabled?: boolean;
      url?: string;
      checkAutomatically?: string;
      fallbackToCacheTimeout?: number;
      requestHeaders?: Record<string, string>;
    };
  };
};
const cfg = appJson.expo;

const read = (...p: string[]) => readFileSync(join(ANDROID, ...p), 'utf8');
const hasNative = existsSync(join(ANDROID, 'app', 'src', 'main', 'AndroidManifest.xml'));

/** `<meta-data android:name="X" android:value="Y"/>` → { X: Y }, attribute order independent. */
function metaData(manifest: string): Record<string, string> {
  const out: Record<string, string> = {};
  // XML entities are decoded, because that is what the platform does: the channel header is a JSON
  // string and its quotes must be `&quot;` in a double-quoted attribute.
  const decode = (s: string) => s
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  for (const tag of manifest.match(/<meta-data[^>]*\/>/g) ?? []) {
    const name = /android:name="([^"]+)"/.exec(tag)?.[1];
    const value = /android:value="([^"]*)"/.exec(tag)?.[1];
    if (name) out[name] = decode(value ?? '');
  }
  return out;
}
function stringResource(xml: string, name: string): string | undefined {
  return new RegExp(`<string[^>]*name="${name}"[^>]*>([^<]*)</string>`).exec(xml)?.[1];
}

const describeIfNative = hasNative ? describe : describe.skip;

describeIfNative('the native project agrees with app.json', () => {
  const manifest = read('app', 'src', 'main', 'AndroidManifest.xml');
  const strings = read('app', 'src', 'main', 'res', 'values', 'strings.xml');
  const gradle = read('app', 'build.gradle');
  const md = metaData(manifest);

  it('the updater is enabled when app.json enables it', () => {
    // `getUpdatesEnabled` writes String(updates.enabled ?? false). A false here is a silent no-op
    // updater: the JS still reports its version, the About row still renders, nothing ever arrives.
    expect(md['expo.modules.updates.ENABLED']).toBe(String(cfg.updates?.enabled ?? false));
  });

  it('carries the update URL', () => {
    expect(cfg.updates?.url).toBeTruthy();
    expect(md['expo.modules.updates.EXPO_UPDATE_URL']).toBe(cfg.updates?.url);
  });

  it('spells check-on-launch the way the plugin does', () => {
    // ON_LOAD is 'ALWAYS' natively; the other three are one-to-one.
    const map: Record<string, string> = {
      ON_LOAD: 'ALWAYS',
      ON_ERROR_RECOVERY: 'ERROR_RECOVERY_ONLY',
      WIFI_ONLY: 'WIFI_ONLY',
      NEVER: 'NEVER',
    };
    const declared = cfg.updates?.checkAutomatically ?? 'ON_LOAD';
    expect(md['expo.modules.updates.EXPO_UPDATES_CHECK_ON_LAUNCH']).toBe(map[declared]);
  });

  it('never blocks a launch on the network', () => {
    // fallbackToCacheTimeout must be 0 so the bundled JS runs immediately; the manifest value is what
    // actually enforces it, and a non-zero default here would put a splash screen between a student
    // and their timetable.
    expect(cfg.updates?.fallbackToCacheTimeout ?? 0).toBe(0);
    expect(md['expo.modules.updates.EXPO_UPDATES_LAUNCH_WAIT_MS']).toBe('0');
  });

  it('pins the runtime version to the app version, in both places', () => {
    // policy: appVersion means the runtime is `version`. The plugin writes the manifest entry as a
    // string resource; the resource's value is what a phone matches an update against.
    expect(cfg.runtimeVersion).toEqual({ policy: 'appVersion' });
    expect(md['expo.modules.updates.EXPO_RUNTIME_VERSION']).toBe('@string/expo_runtime_version');
    expect(stringResource(strings, 'expo_runtime_version')).toBe(cfg.version);
  });

  it('carries the channel the publisher will publish to', () => {
    // `expo-updates` resolves the channel from the `expo-channel-name` request header, and an APK
    // without it is answered with no update at all — silently. EAS Build injects this; a build from the
    // committed native folder does not, so it is declared here and checked against `eas.json`.
    const headers = JSON.parse(md['expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY'] ?? '{}');
    const eas = JSON.parse(readFileSync(join(ROOT, 'eas.json'), 'utf8'));
    expect(headers['expo-channel-name']).toBe(cfg.updates?.requestHeaders?.['expo-channel-name']);
    expect(headers['expo-channel-name']).toBe(eas.build.preview.channel);
  });

  it('reports the same version to Android as the app reports to the user', () => {
    expect(/versionName\s+"([^"]+)"/.exec(gradle)?.[1]).toBe(cfg.version);
  });

  it('has a versionCode above every build that has shipped', () => {
    const code = Number(/versionCode\s+(\d+)/.exec(gradle)?.[1]);
    expect(Number.isInteger(code)).toBe(true);
    // Equal codes install over each other and make "did the update land?" unanswerable on the phone.
    expect(code).toBeGreaterThan(SHIPPED_VERSION_CODE);
  });
});
