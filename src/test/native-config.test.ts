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
    android?: { allowBackup?: boolean };
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

/**
 * Android Auto Backup, v0.5 (WS3).
 *
 * Uninstall is the one action that deletes the planner, and the app cannot intercept it — Android has no
 * "keep the data?" dialog an app can raise. What an app CAN do is tell the platform to copy its private
 * data to the user's backup, and restore it on the next install: `allowBackup` plus a rules file. That
 * only works if the rules actually name the database, which is exactly the kind of file nothing else in
 * the repo looks at — so it is pinned here, next to the updater keys, for the same reason.
 *
 * The two attributes are not interchangeable: devices on API 31+ read `dataExtractionRules`, devices on
 * API 30 and below read `fullBackupContent`. Declaring only one leaves half the installed base with the
 * platform default instead of these rules, which is a silent difference on a phone and invisible here.
 */
describeIfNative('Android Auto Backup carries the planner to a new install', () => {
  const manifest = read('app', 'src', 'main', 'AndroidManifest.xml');
  /** The `<application …>` start tag — where every backup attribute lives. */
  const appTag = /<application\b[^>]*>/.exec(manifest)?.[0] ?? '';
  const attr = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(appTag)?.[1];
  /** A rules file, or '' when it does not exist — a missing file should fail an assertion with a readable
   *  message, not throw ENOENT out of the whole suite. */
  const rulesFile = (name: string) => (existsSync(join(ANDROID, 'app', 'src', 'main', 'res', 'xml', name))
    ? read('app', 'src', 'main', 'res', 'xml', name)
    : '');
  /** `<include domain="database" path="."/>` → [{ domain, path }]. Both rules formats use these tags. */
  const tags = (doc: string, tag: 'include' | 'exclude') =>
    (doc.match(new RegExp(`<${tag}\\b[^>]*/>`, 'g')) ?? []).map((t) => ({
      domain: /domain="([^"]*)"/.exec(t)?.[1] ?? '',
      path: /path="([^"]*)"/.exec(t)?.[1] ?? '',
    }));
  const files = ['backup_rules.xml', 'data_extraction_rules.xml'];

  it('turns Auto Backup on in both places, the manifest being the one that ships', () => {
    // `@expo/config-plugins`' AllowBackup plugin writes `config.android.allowBackup ?? true`, so true is
    // the default — but it is stated in app.json too, because a later `allowBackup: false` there would
    // otherwise be a promise the APK does not keep.
    expect(cfg.android?.allowBackup ?? true).toBe(true);
    expect(attr('android:allowBackup')).toBe('true');
  });

  it('points the manifest at a rules file for both API levels, and both files exist', () => {
    expect(attr('android:dataExtractionRules')).toBe('@xml/data_extraction_rules'); // API 31+
    expect(attr('android:fullBackupContent')).toBe('@xml/backup_rules');           // API 30 and below
    for (const f of files) expect(rulesFile(f).trim()).not.toBe('');
  });

  it('back-ups the SQLite database and the shared preferences, at both API levels', () => {
    for (const f of files) {
      const inc = tags(rulesFile(f), 'include');
      expect({
        file: f,
        // `marginalia.db` and its -wal/-shm siblings live in `databases/`; path "." covers the directory.
        databases: inc.some((t) => t.domain === 'database' && t.path === '.'),
        // Expo/React Native keep app-level flags here; a restore that drops them drops the semester.
        prefs: inc.some((t) => t.domain === 'sharedpref' && t.path === '.'),
      }).toEqual({ file: f, databases: true, prefs: true });
    }
  });

  it('keeps the app’s own files, where the pre-migration safety copies are written', () => {
    // `services/safety.ts` writes under `Paths.document/marginalia/backups`, which is the `file` domain.
    // Leaving it out would restore the database but silently drop the copies made to protect it.
    for (const f of files) {
      expect({ file: f, files: tags(rulesFile(f), 'include').some((t) => t.domain === 'file') }).toEqual({ file: f, files: true });
    }
  });

  it('excludes the cache and nothing the planner actually stores', () => {
    for (const f of files) {
      const ex = tags(rulesFile(f), 'exclude');
      // "Excluded" is the only way data ever stops being backed up, so every exclusion must be a cache
      // path — a stray `<exclude domain="database"/>` would look like a working backup and restore an
      // empty planner.
      expect({ file: f, onlyCache: ex.every((t) => t.path.startsWith('cache')) }).toEqual({ file: f, onlyCache: true });
      expect({ file: f, keepsData: ex.every((t) => !['database', 'sharedpref', 'file'].includes(t.domain)) })
        .toEqual({ file: f, keepsData: true });
    }
  });

  it('declares device transfer as well as cloud backup on API 31+', () => {
    // `dataExtractionRules` has two sections. Only `<cloud-backup>` is backed up to Google's servers; a
    // phone-to-phone migration reads `<device-transfer>`. A rules file with one section silently exempts
    // the other, so each is checked for the database include on its own.
    const doc = rulesFile('data_extraction_rules.xml');
    const section = (name: 'cloud-backup' | 'device-transfer') => {
      const at = doc.indexOf(`<${name}`);
      const end = doc.indexOf(`</${name}>`);
      return at >= 0 && end > at ? doc.slice(at, end) : '';
    };
    for (const name of ['cloud-backup', 'device-transfer'] as const) {
      const body = section(name);
      const inc = tags(body, 'include');
      expect({
        section: name,
        databases: inc.some((t) => t.domain === 'database'),
        prefs: inc.some((t) => t.domain === 'sharedpref'),
      }).toEqual({ section: name, databases: true, prefs: true });
    }
  });
});

describeIfNative('v0.5 release engineering (R1)', () => {
  const manifest = read('app', 'src', 'main', 'AndroidManifest.xml');
  const gradle = read('app', 'build.gradle');
  const perm = (name: string) => {
    const tag = manifest.match(new RegExp(`<uses-permission[^>]*android:name="android\\.permission\\.${name}"[^>]*/>`))?.[0] ?? '';
    return { 'tools:node': /tools:node="([^"]+)"/.exec(tag)?.[1] };
  };

  it('ships as 0.5.0, version code 4', () => {
    expect(appJson.expo.version).toBe('0.5.0');
    expect(gradle).toMatch(/versionCode 4\b/);
    expect(gradle).toContain('versionName "0.5.0"');
  });

  it('asks for no legacy storage and no draw-over-apps — and strips them if a library merges them in', () => {
    for (const name of ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'SYSTEM_ALERT_WINDOW']) {
      expect({ name, node: perm(name)?.['tools:node'] }).toEqual({ name, node: 'remove' });
    }
  });

  it('the dev variant installs beside the real app under its own label; release refuses to build without the key', () => {
    expect(gradle).toMatch(/marginVariant == 'dev'\) \{\s*applicationIdSuffix '\.dev'\s*manifestPlaceholders = \[appLabel: 'Margin dev'\]/);
    expect(manifest).toContain('android:label="${appLabel}"');
    expect(gradle).toContain("throw new GradleException('variant=release needs MARGIN_KEYSTORE_PATH");
    expect(gradle).not.toMatch(/storePassword System\.getenv\('ANDROID_KEYSTORE_PASSWORD'\) \?:/); // no fallback password
  });
});

/* v0.5 N1: the in-repo module `modules/margin-native` ships in the APK by autolinking (Expo searches
   `modules/` by default), so its manifest is merged into the app's. These pins are what the live
   countdown and the Focus silent switch need from it, and what Metro needs to bundle the mascot. */
describe('the margin-native module and the Rive asset', () => {
  const mod = (...p: string[]) => readFileSync(join(ROOT, 'modules', 'margin-native', ...p), 'utf8');
  it('registers its module class for Android only', () => {
    const cfg = JSON.parse(mod('expo-module.config.json')) as { platforms: string[]; android: { modules: string[] } };
    expect(cfg.platforms).toEqual(['android']);
    expect(cfg.android.modules).toEqual(['app.marginalia.nativebits.MarginNativeModule']);
    expect(mod('android', 'src', 'main', 'java', 'app', 'marginalia', 'nativebits', 'MarginNativeModule.kt')).toContain('Name("MarginNative")');
  });
  it('asks for Do Not Disturb policy access and Android 16 promoted notifications, and declares its dismiss receiver unexported', () => {
    const m = mod('android', 'src', 'main', 'AndroidManifest.xml');
    expect(m).toContain('android.permission.ACCESS_NOTIFICATION_POLICY');
    expect(m).toContain('android.permission.POST_PROMOTED_NOTIFICATIONS');
    expect(m).toMatch(/<receiver android:name="app\.marginalia\.nativebits\.LiveDismissReceiver" android:exported="false"\/>/);
  });
  it('Metro bundles .riv files, and the mascot is a real Rive file', () => {
    expect(readFileSync(join(ROOT, 'metro.config.js'), 'utf8')).toContain("assetExts.push('riv')");
    expect(readFileSync(join(ROOT, 'assets', 'rive', 'teddy.riv')).subarray(0, 4).toString('latin1')).toBe('RIVE');
  });
});

