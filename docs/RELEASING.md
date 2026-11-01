# Releasing Margin

Everything here is run by the owner. Agents build and test only the `dev` and `over` variants and never
tag, publish an update, or create a GitHub release.

## 1. The release key (once, ever)

Run on your own machine, never in CI and never by an agent:

```sh
keytool -genkeypair -v -storetype PKCS12 -keystore margin-release.keystore \
  -alias margin -keyalg RSA -keysize 4096 -validity 36500
# keep 2 offline copies of margin-release.keystore + the passwords (lose them = no update can ever install)
base64 -w0 margin-release.keystore > margin-release.b64
gh secret set ANDROID_KEYSTORE_BASE64 < margin-release.b64
gh secret set ANDROID_KEYSTORE_PASSWORD     # prompts
gh secret set ANDROID_KEY_ALIAS --body margin
gh secret set ANDROID_KEY_PASSWORD          # prompts
gh secret set EXPO_TOKEN                     # from expo.dev → Access tokens
rm margin-release.b64
```

`*.keystore`, `*.jks` and `*.b64` are git-ignored; only `android/app/debug.keystore` is committed (it is
public by design). Check the secrets are there with `gh secret list`.

**Moving from the debug key to the release key.** v0.1.0 on your phone is signed with the debug key.
Android refuses to install an APK signed with a different key over it, so the first release-key install
needs a clean install: export your data first (Settings → Data → Export), uninstall, install the
release APK, then import the export. After that, every release-key APK installs over the previous one.

## 2. Building an APK

Actions → **Release APK** → *Run workflow* on `v2-improvements`, with `variant`:

| variant | id | key | use |
|---|---|---|---|
| `dev` | `app.marginalia.planner.dev`, labelled "Margin dev" | debug | testing beside the real app |
| `over` | `app.marginalia.planner` | debug | installs **over** v0.1.0/0.3.1, keeping data |
| `release` | `app.marginalia.planner` | release (secrets) | the shipped build |

From a terminal: `gh workflow run release-apk.yml --ref v2-improvements -f variant=dev`, then
`gh run watch` and `gh run download <run-id>`. The artifact is `margin-android-apk-<variant>`, holding
`margin-v0.5.0-<variant>-android.apk`. A `release` run without the key secrets fails on purpose; the
Gradle build refuses to fall back to the debug key.

Pushing a `v*` tag builds the `release` variant and attaches it to a GitHub release. Tag only after the
device test in `docs/DEVICE_CHECKLIST.md` passes.

## 3. Over-the-air updates (JS only)

The runtime version follows `app.json → version` (`runtimeVersion.policy: appVersion`), so an update
reaches only installs of the same version (0.5.0). Anything that changes native code needs a new APK.

Publish (needs `EXPO_TOKEN` in the environment, or `eas login`):

```sh
npx eas-cli update --channel preview --message "0.5.x: what changed"
```

Check it reached the phone: open Margin, background it and come back (the check runs on resume, at most
every five minutes), then reopen it. About shows the update and a one-line "You're now on…" toast appears.

**Roll back** (pick one):

```sh
# point the channel back at the previous update group
npx eas-cli update:rollback --channel preview
# or republish a known-good group
npx eas-cli update:republish --group <group-id> --channel preview
# or send every phone back to the JS embedded in its APK
npx eas-cli update:roll-back-to-embedded --channel preview --runtime-version 0.5.0
```

A phone that received a bad update recovers on its next launch after the rollback is published.

## 4. Version bump checklist

`app.json` version, `src/domain/version.ts` `APP_VERSION`, `android/app/build.gradle` `versionName` and
`versionCode` (+1 every release), and `expo_runtime_version` in `android/app/src/main/res/values/strings.xml`.
`src/test/native-config.test.ts` fails if they disagree.
