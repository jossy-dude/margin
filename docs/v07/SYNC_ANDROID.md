# v0.7 sync: the Android side, and battery

Scope: Margin's half of live Obsidian sync (item 1), the phone-as-hotspot case, and how to keep the battery cost
negligible. The wire protocol, the desktop hub (`bone-syncd`) and the Obsidian plugin are the Obsidian planner's:
`~/Documents/Projects/vault-sync/docs/v07/SYNC_PROTOCOL.md` and `SPIKE.md` (read and aligned with on 2026-11-12, see §10).

## 0. The answer in one table

| Decision | Choice | Why (details below) |
|---|---|---|
| Who keeps the phone's connection | one Kotlin **foreground service** in `modules/margin-native` (`SyncService`), no JS needed | Battery Saver is on 99.7 % of the time on this phone and blocks background network for any app that is not in the foreground or running a foreground service |
| Service type | **`connectedDevice`** (+ `CHANGE_NETWORK_STATE`) | no time limit; `dataSync` gets 6 h per 24 h from Android 15; `specialUse` needs a written justification |
| When it runs | always, but **dormant** (no socket, no wakelock, no timers) unless on the home network or the hotspot | starting a foreground service from the background is blocked since Android 12, so it has to already exist when the network appears |
| When the socket is open | home Wi-Fi or hotspot-with-desktop **and** (screen on, or Margin/Obsidian visible, or unsent changes, or a shared timer running) | Wi-Fi is already awake while the screen is on; a closed socket costs nothing |
| While the screen is off | socket closed; **no heartbeat at all**; catch up on wakeups that already happen (class boundaries, alarms) plus at most 12 opportunistic jobs a day | a 30 s heartbeat would be ~2,900 wakeups and ~200 mAh a day |
| Home detection | network fingerprint from `LinkProperties` (no location permission), confirmed by the hub's cryptographic handshake | SSID/BSSID need location permission |
| Hotspot | detected via the AP-state broadcast + the AP network interface; Margin listens on the hotspot address only; the **desktop dials the phone** | the phone is the gateway; mobile data stays the default network |
| Client library | **OkHttp 4.9.2 WebSocket**, already inside the APK (React Native uses it) | 0 KB added |
| Server library (loopback for phone Obsidian, hotspot for the desktop) | **Java-WebSocket 1.6.0** (MIT, ~150 KB with slf4j-api) | maintained, tiny, NIO, server + client |
| Phone vault writes when Obsidian is closed | SAF, with **document URIs built from paths** (no directory listing); optional "All files access" fast mode if SAF measures slow | `findFile`/`listFiles` are what make SAF slow |
| Opportunistic catch-up | framework **`JobScheduler`** (unmetered network, periodic 2 h) | no WorkManager dependency in the APK today |
| Budget | **≤ 5 mAh/day** added on a normal day (0.11 % of 4,500 mAh), hard ceiling 10 | §7 |

---

## 1. The phone, measured (2026-11-12, read-only adb)

| Fact | Value | Source |
|---|---|---|
| Device | Samsung SM-A516N (Galaxy A51 5G), Android 13 (API 33), One UI 5.1, build A516NKSS8FXE1 | `getprop` |
| Battery | 4,500 mAh (estimated and learned capacity) | `dumpsys batterystats` |
| **Battery Saver** | **on for 2 h 47 m of 2 h 48 m on battery (99.7 %)**; `settings get global low_power` = 1 | batterystats, settings |
| Standby buckets | Margin, Obsidian, GitSync all **10 (ACTIVE)** | `am get-standby-bucket` |
| Doze allow-list | none of the three | `dumpsys deviceidle whitelist` |
| Margin's alarms now | `TICK` exact RTC_WAKEUP at the next class boundary / midnight; `ALARM_FIRE` 08:45 via `setAlarmClock` | `dumpsys alarm` |
| Obsidian under Battery Saver | `blocked=BATTERY_SAVER, allowed=FOREGROUND|TOP` (network cut the moment it is hidden) | SPIKE.md |

Baseline power since the last charge (2 h 48 m on battery, screen on 89.7 %):

| App (uid) | Total | Screen | CPU fg | CPU bg | CPU cached | FGS | Other |
|---|---|---|---|---|---|---|---|
| Margin (u0a240) | **49.0 mAh** | 35.1 (13 m 19 s on screen) | 12.3 | 0.013 | 0.61 | 0.058 | audio 0.40, system services 0.60 |
| Obsidian (u0a490) | 109 mAh | 76.2 | 30.2 | 0.001 | 1.33 | – | audio 0.79 |
| GitSync (u0a399) | 12.8 mAh | 8.66 | 4.07 | 0.048 | 0.033 | – | |
| Whole phone | 1,260 mAh discharged; Wi-Fi 46.7, idle 80.1 | | | | | | |

Margin's background cost today is ~0.7 mAh per 2.8 h (cached CPU + FGS + wakelock). That is the line sync must not
visibly move.

---

## 2. Foreground service type

| Type | Fit | Limits | Prerequisites (Android 14+) |
|---|---|---|---|
| `dataSync` | the obvious name | **Android 15: 6 h per 24 h shared by all dataSync services, then `onTimeout`; cannot restart until the app is opened** ([FGS timeouts](https://developer.android.com/develop/background-work/services/fgs/timeout)); cannot be started from `BOOT_COMPLETED` on Android 15 | `FOREGROUND_SERVICE_DATA_SYNC` |
| **`connectedDevice`** | "interactions with external devices that require a Bluetooth, NFC, IR, USB, or **network** connection": the desktop is our paired device on the LAN/hotspot | **no time limit**; may start from `BOOT_COMPLETED` | `FOREGROUND_SERVICE_CONNECTED_DEVICE` + one of `CHANGE_NETWORK_STATE`, `CHANGE_WIFI_STATE`, `CHANGE_WIFI_MULTICAST_STATE`, Bluetooth/NFC/UWB/USB ([FGS types required](https://developer.android.com/about/versions/14/changes/fgs-types-required)) |
| `specialUse` | fallback | no time limit | `FOREGROUND_SERVICE_SPECIAL_USE` + a `<property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE">` and, on Play, a written review |
| `systemExempted` | already used by `AlarmService` | reserved for alarm/VPN-type apps | |

**Choice: `connectedDevice`**, declaring `CHANGE_NETWORK_STATE` (a normal permission, granted at install). The phone
is on Android 13, where types are declared but not enforced; the declaration matters for any newer phone and keeps the
app honest if it ever goes on Play (Margin is sideloaded today, so Play's FGS declaration form does not apply yet).

**One notification, not two.** The service's notification *is* the existing ongoing Margin notification: while a class
runs it shows the pinned class (today's `ClassPin`), otherwise a minimised row on a silent `IMPORTANCE_MIN` channel
"Margin is connected" / "Margin" (collapsed to an icon-less line at the bottom of the shade). The class pin and the sync
service merge in `Surfaces.kt`.

**Why always-on but dormant.** Android 12+ refuses `startForegroundService()` from the background except for listed
exemptions (boot, exact alarm firing, user tapping a notification/widget, …). A `NetworkCallback` firing "home Wi-Fi is
back" while the app is in the background is **not** an exemption. So the service starts at boot, at app launch and from
the exact `TICK`/alarm receivers (which are exempt), and stays up doing nothing. Dormant = a registered
`NetworkCallback` and two screen receivers; **zero wakeups, zero wakelocks, zero sockets**. It costs memory (~30–60 MB
while the React runtime is not loaded), not battery.

---

## 3. Knowing where the phone is, without location

### Home Wi-Fi

`WifiInfo.getSSID()`/`getBSSID()` return `<unknown ssid>` / `02:00:00:00:00:00` without a location permission and
location turned on ([WifiInfo](https://developer.android.com/reference/android/net/wifi/WifiInfo)); background
location would be needed with the screen off. Not worth it.

| Signal | API | Permission |
|---|---|---|
| a Wi-Fi network came or went, and its details changed | `ConnectivityManager.registerNetworkCallback(NetworkRequest(TRANSPORT_WIFI, NOT_VPN))`: `onAvailable`, `onLinkPropertiesChanged`, `onLost` | `ACCESS_NETWORK_STATE` (normal) |
| fingerprint of that network | `LinkProperties`: IPv4 address + prefix, default route's gateway, DNS servers, search domain, `getDhcpServerAddress()` (API 30+) | none |
| is it really home? | dial the cached hub address for that fingerprint (1.5 s timeout); the hub must pass the HMAC challenge with the pair key (SYNC_PROTOCOL.md §3) | none |
| not cached / changed | NSD browse `_bone-sync._tcp` for ≤ 10 s, resolve, then the same handshake | `INTERNET` (NsdManager handles multicast itself on API 33) |

The fingerprint is only a **hint** (many homes are `192.168.1.1/24`); the handshake is the truth. A wrong guess costs
one TCP SYN that times out. The Obsidian planner's draft caches addresses "per network, key = Wi-Fi BSSID": Margin
will key them by this fingerprint instead (alignment item, §10).

### The phone's hotspot (owner's added requirement)

When there is no home Wi-Fi, the owner turns the hotspot on and the desktop joins it. Then the phone is the gateway,
**mobile data is the default network**, and the Wi-Fi radio is in AP mode, so there is no `TRANSPORT_WIFI` network
for the phone itself.

| Need | How | Notes |
|---|---|---|
| Hotspot turned on/off | dynamic receiver for `android.net.wifi.WIFI_AP_STATE_CHANGED` (extra `wifi_state`: 13 on, 11 off) and `android.net.conn.TETHER_STATE_CHANGED` | both are hidden-API actions but are ordinary sticky broadcasts any app can receive; reports say some OEMs report wrong states, so the next row confirms ([community notes](https://liarrdev.github.io/post/Check-If-Android-Tethering-Enabled/)) |
| Confirm, and get our address | `NetworkInterface.getNetworkInterfaces()`: an interface that is up, not loopback, named `swlan0` (Samsung), `ap0`, `wlan1` or `softap*`, with a private IPv4 that is not the mobile one | re-checked on each broadcast; no polling. `TetheringManager` callbacks are system-only |
| Subnet | random private /24 since Android 11 (the desktop held `10.36.6.130/24` on this hotspot, SPIKE.md); never stored as identity | |
| Listen | `SyncServer` (Java-WebSocket) bound to **the AP interface address only**, port 7429, while the hotspot is on | never on mobile data. Same handshake as everything else |
| Who dials | **the desktop**: it sees it is on the paired phone's hotspot and dials `ws://<its default gateway>:7429` (SYNC_PROTOCOL.md §4 step 3) | no discovery needed on the phone side |
| Fallback if inbound fails | Margin dials out to the desktop's address learned from the last hotspot session, and `bindSocket`-free routing applies: Android puts the tethered subnet in the local-network routing table, so a socket to `10.x.y.z` on that /24 uses the AP interface even though mobile data is default; if that proves false on One UI, bind with `SocketFactory` from the AP `NetworkInterface` address | test S4/S5 |
| "Home" rule | **hotspot on + a paired desktop completed the handshake** counts exactly like home Wi-Fi | |
| Battery | the hotspot already keeps the Wi-Fi chip fully awake and uses hundreds of mW; while it is on, sync keeps the socket **live the whole time** (real-time both ways) because idling it saves nothing | |
| Security | the hotspot is **open (no password)** today (SPIKE.md). Frames are sealed with AES-GCM so strangers can't read them, but a hotspot password is still the fix (Questions) | |

---

## 4. The connection policy (the battery heart)

```
            no home/hotspot                     home Wi-Fi seen, or hotspot + desktop handshake
 DORMANT ─────────────────────────────▶ DORMANT ──────────────────────────────────────────▶ READY
   ▲                                                                                          │
   │ network lost                                       screen on · Margin/Obsidian visible · │
   │                                                    outbox not empty · timer running      ▼
 READY ◀──── screen off ≥ 60 s, outbox empty, no timer, nothing visible ──────────────────── LIVE
                                         (send `bye`, close)                     (socket open)
```

| Rule | Detail |
|---|---|
| Open | entering LIVE: dial (or accept), `hello` with the cursor, receive deltas. Typical reconnect: 1 TCP + 2 frames + deltas, < 300 ms on home Wi-Fi |
| Close | LIVE → READY after 60 s of screen-off with nothing pending (60 s covers "glance at the phone, put it down, pick it up") |
| Screen state | dynamic `ACTION_SCREEN_ON`/`ACTION_SCREEN_OFF`/`ACTION_USER_PRESENT` receivers in the service: event-driven, free |
| Heartbeat while LIVE | **no periodic ping while traffic flows**; one app-level `ping` on every screen-on and on Obsidian's `visibilitychange` (SPIKE: sockets are half-dead after resume); an idle-LIVE ping every 120 s only while the screen is on. OkHttp `pingInterval(0)` (off); TCP keepalive off |
| Heartbeat while screen off | **none**: the socket is closed |
| Reconnect backoff | 1, 2, 4, 8 … s, cap 5 min, ±20 % jitter; reset on network change, screen-on, or app open; after 5 failures wait for the next network/screen event instead of retrying |
| Local Margin changes | JS store → native `Sync.pushBridge(json)` with a 750 ms debounce → one `bridge` frame. Offline: kept in the outbox table, replayed in order |
| Phone vault changes | come from phone Obsidian (client O) over loopback while it is open. When it is closed, nothing else edits the phone vault (GitSync retired), so **Margin never scans the vault on a timer**; it writes what the hub sends (§6) |
| Desktop changes while the phone sleeps | not pushed. They arrive at the next screen-on (≤ 1 s after unlock) or the next catch-up |
| Catch-ups while asleep | (1) piggyback on wakeups that already happen: the `TICK` receiver (each class start/end, midnight) and the alarm receiver: if READY and the last sync is > 30 min old, open, sync, close, inside the receiver's `goAsync()` window (≤ 10 s); (2) `JobScheduler` periodic job, 2 h, `NETWORK_TYPE_UNMETERED`, `setRequiresBatteryNotLow`, persisted; it simply wakes the service. Together ≤ ~12 extra short connects a day, and they matter only for Obsidian tasks with a time (so their reminder gets scheduled) |
| Shared focus timer | while a timer runs on any device, LIVE is kept even with the screen off (the end must ring on time on the phone) — but the phone does not need the socket to ring: it schedules its own exact alarm for `endsAt`, so the socket can still close; it reopens on the alarm |
| Frames | text JSON; payloads > 4 KB (manifests) go gzip-compressed in a binary frame; edits are diff-match-patch patches (a 9 KB note edit ≈ 200 bytes) |
| Wake lock | none in DORMANT/READY; a 10 s partial wakelock only inside a catch-up |

Why not "keep the socket and let the desktop push"? FCM needs the internet and a server; on a LAN the only push is a
held socket. A held socket with no keepalive is nearly free on Wi-Fi, but every desktop write (the vault auto-commits,
Claude's vault-log writes, a desktop timer tick) would wake the phone, the hub cannot know whether a phone-side NAT or
power-save path silently dropped it (SPIKE saw half-dead sockets), and Battery Saver's behaviour on One UI is not
documented. Screen-gated sockets plus piggybacked catch-ups give the same freshness at the moment the owner looks,
with a bounded number of wakeups. Revisit only if the measurement in §8 shows reconnects dominate.

---

## 5. Libraries

| Need | Option | Size | Maintenance | Verdict |
|---|---|---|---|---|
| WebSocket **client** (Margin → hub) | **OkHttp 4.9.2** `newWebSocket` | 0 KB (already in the APK via React Native) | Square, active | **use** (permessage-deflate supported) |
| | Ktor client | ~1–2 MB + coroutines | active | no |
| WebSocket **server** (loopback 127.0.0.1:7429 for phone Obsidian; hotspot address for the desktop) | **Java-WebSocket 1.6.0** (`org.java-websocket:Java-WebSocket`, Dec 2024) | ~150 KB + `slf4j-api` | maintained, MIT, "Android 4.0 and higher" | **use** |
| | NanoHTTPD 2.3.1 + websocket module | ~100 KB | last release 2016 | no |
| | Ktor server CIO | several MB | active | no (size, startup) |
| | hand-written (like the desktop spike's) | ~300 lines | ours | fallback if 1.6.0 misbehaves |
| Hash | `java.security.MessageDigest` SHA-256 | 0 | platform | use |
| Seal (AES-256-GCM, HKDF) | `javax.crypto` + a 30-line HKDF | 0 | platform | use; keys in Android Keystore |
| 3-way merge for `.md` | `diff-match-patch` Java port (Apache-2.0, one file) | ~60 KB | stable | use, same algorithm as the JS `sync-core` |
| JSON key merge (`json3`) | port of `tools/json3.py` (~150 lines Kotlin) | 0 | ours | use |
| Catch-up scheduling | `JobScheduler` | 0 | platform | use (WorkManager is not in the APK) |
| State store | **separate Kotlin-owned SQLite `sync.db`** (`android.database.sqlite`) | 0 | platform | use, so the service never shares expo-sqlite's connection (see BUGS.md #11) |

---

## 6. Writing the phone vault through SAF (Obsidian closed)

The vault is `content://com.android.externalstorage.documents/tree/primary:Documents/Obsidian_vault_bone` (logcat),
2,851 files, 208 MB (SYNC_PROTOCOL.md).

| Problem today | Evidence |
|---|---|
| Every 30 s `readDirectoryAsync(vault)` lists the **whole vault root**, then `.margin/` | `src/services/vaultFiles.ts:35-38`, `src/store/vault.ts:55` |
| `DocumentFile: Failed query: UnsupportedOperationException: Unsupported Uri …tree/primary%3ADocuments%2FObsidian_vault_bone` twice per tick in logcat | pid 6412, 22:54:42 onwards |

| Technique | Cost | Use |
|---|---|---|
| `DocumentFile.findFile()` / `listFiles()` | one provider query per child, or the whole folder in RAM; reported 30 s for 1,000 files ([SO](https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/42186820/why-is-documentfile-so-slow-and-what-should-i-use-instead), [CommonsWare](https://commonsware.com/blog/2019/12/14/scoped-storage-stories-listfiles-woe.html)) | never |
| **Build the document URI from the path**: ExternalStorageProvider's document ids are `primary:<path>`, so `DocumentsContract.buildDocumentUriUsingTree(tree, "primary:Documents/Obsidian_vault_bone/" + rel)` needs **no query** | one binder call to open, then a FUSE write | **default** |
| Children of one folder | `buildChildDocumentsUriUsingTree` + one `query()` asking only id, name, size, last_modified | for the rare full compare |
| New file / folder | `DocumentsContract.createDocument(parentUri, mime, name)` | |
| Atomic replace | write `.<name>.sync.tmp`, then `renameDocument` | Obsidian ignores dot files; the hub's ignore list already has `.*.tmp` |
| **"All files access"** (`MANAGE_EXTERNAL_STORAGE`) | plain `java.io.File` on `/storage/emulated/0/Documents/...`: the fastest path | opt-in "fast vault mode" if the benchmark below shows SAF > 30 ms per small file. Fine for a sideloaded app; Play would refuse it for this use |

**Benchmark (Phase 0, debug build):** write and read back 200 files of 4 KB under `<vault>/.margin/bench/` with both
methods; record p50/p95 ms per file and total CPU from `dumpsys cpuinfo`. Decide the default from that.

**Who writes while phone Obsidian is open** (SPIKE test S2): if Obsidian's file watcher picks up Margin's direct
writes cleanly, Margin may write while O is connected; otherwise all writes go through O (`app.vault.process`) while it
is connected, and through SAF only when it is not. Until S2 is run, route through O whenever O is connected.

---

## 7. Power budget

Energy of one extra wakeup with a short exchange: ~2 s of CPU + Wi-Fi at ~500 mW ≈ 1 J ≈ **0.07 mAh** at 3.85 V
(Wi-Fi active vs suspended: >120 mW vs ~11 mW on early phones, [Katz et al.](https://sites.cs.ucsb.edu/~ckrintz/racelab/rre/papers/Katz_Energy.pdf);
Wi-Fi chip energy depends mostly on time awake, [UCLouvain](https://research.dial.uclouvain.be/bitstreams/5c32840a-d178-4df0-85ea-38b1e135f52f/download)).

| Activity | Count / day (normal school day) | Cost each | Per day |
|---|---|---|---|
| Dormant service (no socket) | always | ~0 (no wakeups) | ~0 |
| Reconnect at screen-on | ~80 | ~0.3 s extra on an already-awake radio ≈ 0.12 J | ~0.7 mAh |
| Frames while LIVE (edits, tasks, timer) | ~300 | a few ms CPU | ~0.2 mAh |
| Catch-ups while asleep (TICK piggyback + 2 h job) | ≤ 12 | ~1 J | ~0.9 mAh |
| SAF writes when Obsidian is closed | ~50 files | ~20 ms each | ~0.1 mAh |
| Hotspot sessions | per session | the hotspot itself dominates; sync adds < 1 % of it | – |
| **Total** | | | **≈ 2 mAh/day** (target ≤ 5, ceiling 10) |
| For comparison: a 30 s heartbeat 24/7 | 2,880 | ~0.07 mAh | ≈ 200 mAh/day (4–5 % of the battery) |
| Retiring GitSync | | measured 12.8 mAh in 2.8 h (mostly foreground) | saving |

---

## 8. Measuring it

| Step | Command / place | Pass |
|---|---|---|
| 1. Baseline (done) | §1 table, 2026-11-12 | |
| 2. Reset at full charge | `adb shell dumpsys batterystats --reset` | |
| 3. One normal day with sync **off**, one with sync **on** (same routine) | | |
| 4. Read per-app power | `adb shell dumpsys batterystats --charged app.marginalia.planner` → `Estimated power use` row for u0a240: `cpu:bg`, `cpu:fgs`, `cpu:cached`, `wifi`, `wakelock` | on − off ≤ 5 mAh/day |
| 5. Wakeups | `adb shell dumpsys alarm` → per-package stats for `app.marginalia.planner` (wakeups, alarms by tag) | ≤ class boundaries + alarms + 12 |
| 6. Network | `dumpsys batterystats` network rows for uid 10240 (Wi-Fi rx/tx bytes and packets); `dumpsys netstats detail` | bytes/day reported in Diagnostics match |
| 7. Timeline | `adb bugreport margin-day.zip` → Battery Historian (`docker run -p 9999:9999 gcr.io/android-battery-historian/stable:3.1 --port 9999`, [setup](https://developer.android.com/topic/performance/power/setup-battery-historian)): Wi-Fi radio, wakelocks, jobs, app network, screen | no Margin activity during screen-off stretches except catch-ups |
| 8. In-app counters | Diagnostics → Sync: time LIVE, connects, catch-ups, bytes in/out, last error, per day (written by the service) | |
| 9. Samsung check | Settings → Battery → Background usage limits: Margin not in Sleeping/Deep sleeping; onboarding offers "Never sleeping apps" ([Samsung app management](https://developer.samsung.com/mobile/app-management.html), [dontkillmyapp](https://dontkillmyapp.com/samsung)) | service alive after 24 h |

---

## 9. Data model on the phone (`sync.db`, Kotlin-owned)

| Table | Columns | Notes |
|---|---|---|
| `peer` | `device_id` PK, `role`, `name`, `key_alias` (Android Keystore), `net_fp`, `last_addr`, `last_ok_at` | the paired hub; one row per network fingerprint/address hint |
| `cursor` | `k` PK, `v` | hub sequence (`seq`) last applied; vault id |
| `file` | `path` PK, `h`, `base`, `size`, `mtime`, `seq` | 2,851 rows; `base` = last agreed hash (3-way base) |
| `blob` | files in `filesDir/sync/objects/<h>` | last agreed text of each `.md` (for patches/merges); binaries keep hashes only |
| `outbox` | `seq` PK, `frame` (JSON), `created_at`, `tries` | replayed in order; dropped only on `ack ok`; > 7 days old → manifest compare |
| `inbox` | `seq` PK, `kind` (`bridge`, `timer`), `json`, `applied` | rows that arrived while JS was not running; JS applies them on the next foreground (`act.bridgeIn`) |
| `ext_reminder` | `id` PK (`ob-<blockId>`), `title`, `due_at`, `path`, `done`, `updated_at` | **item 4**: Obsidian tasks that are not school tasks, scheduled by the native side; never shown in Margin's task list |
| `stats` | `day` PK, `live_ms`, `connects`, `catchups`, `rx`, `tx`, `err` | Diagnostics → Sync |

JS ↔ native: `Sync.pushBridge(json)`, `Sync.status()`, `Sync.pair(qrText)`, `Sync.forget()`, events
`onBridgeRows`, `onStatus`, `onTimer`. The JS repository keeps its own `updated_at` change feed as the source for
`pushBridge` (BRIDGE.md).

---

## 10. Alignment with the Obsidian planner's protocol

| Their doc says | Margin side | Status |
|---|---|---|
| Hub `bone-syncd` on the desktop, port 7428; Margin = "phone hub", client of H over the LAN, server for O on loopback | `SyncService`: OkHttp client to 7428; Java-WebSocket server on 127.0.0.1:7429 | agree |
| Hotspot: the desktop dials `ws://<gateway>:7429` | server also bound to the AP interface while the hotspot is on | agree |
| Address cache keyed by **Wi-Fi BSSID** | BSSID needs a location permission on Android; Margin keys by a `LinkProperties` fingerprint and lets the handshake decide | **ask them to change the wording** |
| Step 4: sweep the hotspot /24 for TCP 7428 | only if the desktop has not dialled within 10 s of the hotspot coming up; ≤ once per 5 min | agree, rarely needed |
| `ping`/`pong` required after resume | sent on screen-on and on O's `visible`; no periodic ping while the screen is off (socket closed) | agree, with the battery rule |
| O closes its socket 5 s after `hidden`; Margin owns keep-alive and Wi-Fi checks | yes | agree |
| M keeps the last agreed `.md` versions; Kotlin port of `sync-core` merges | `blob` store + diff-match-patch Java + json3 port | agree; the Kotlin merge must pass the same fixtures as the JS one (shared test vectors in `vault-sync/fixtures/`) |
| `timer` messages, one live timer on H | Margin's focus engine (`domain/timer.ts`) becomes a client of H's timer; Margin rings the phone (exact alarm at `endsAt`) | agree |
| `bridge` frames replace the 30 s polling of `.margin/*.json` | `src/store/vault.ts` interval removed; `.margin/margin.json` still written for git history (one writer) | agree |
| Pair by QR + 8-word phrase; keys in Android Keystore | Settings → Obsidian → "Pair with desktop" scans the QR (CameraX barcode or the system code scanner `GmsBarcodeScanning` — no camera permission) | agree; scanner choice open |
| Phase-0 tests S1, S2, S4, S5 | Margin's to run: S1 loopback send from a hidden app under Battery Saver (AOSP's netd lets loopback through power-save firewalls: [commit](https://android.googlesource.com/platform/system/netd/+/238e818%5E%21/)); S2 Obsidian sees external writes; S4 NSD on the hotspot; S5 hotspot subnet/gateway live | Phase 0 in PLAN.md |

## Sources

- FGS types and prerequisites: https://developer.android.com/about/versions/14/changes/fgs-types-required
- FGS timeouts (dataSync 6 h/24 h, Android 15): https://developer.android.com/develop/background-work/services/fgs/timeout
- Doze, App Standby, FGS exemption: https://developer.android.com/training/monitoring-device-state/doze-standby
- Battery Saver cuts background network (Android 9+ power management): https://developer.android.com/about/versions/pie/power
- Loopback allowed through Doze/standby/power-save firewalls (AOSP netd): https://android.googlesource.com/platform/system/netd/+/238e818%5E%21/
- WifiInfo SSID/BSSID need location: https://developer.android.com/reference/android/net/wifi/WifiInfo
- NSD: https://developer.android.com/develop/connectivity/wifi/use-nsd
- Hotspot state detection notes: https://liarrdev.github.io/post/Check-If-Android-Tethering-Enabled/ and https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/12401108/how-to-check-programmatically-if-hotspot-is-enabled-or-disabled
- Random tethering prefix (AOSP): https://gerrit.omnirom.org/plugins/gitiles/android_packages_modules_Connectivity/+/d9acdccbd3a47b2ace49c186b3ecda9bd8fdee9b
- Samsung sleeping apps: https://developer.samsung.com/mobile/app-management.html, https://dontkillmyapp.com/samsung
- SAF performance: https://commonsware.com/blog/2019/12/14/scoped-storage-stories-listfiles-woe.html, https://commonsware.com/blog/2019/11/23/scoped-storage-stories-documentscontract.html
- OkHttp keep-alive/battery discussion: https://github.com/square/okhttp/issues/6838
- Java-WebSocket: https://github.com/TooTallNate/Java-WebSocket
- Wi-Fi power: https://sites.cs.ucsb.edu/~ckrintz/racelab/rre/papers/Katz_Energy.pdf, https://research.dial.uclouvain.be/bitstreams/5c32840a-d178-4df0-85ea-38b1e135f52f/download
- Battery Historian: https://developer.android.com/topic/performance/power/setup-battery-historian
- Obsidian planner's protocol and spike: `~/Documents/Projects/vault-sync/docs/v07/SYNC_PROTOCOL.md`, `SPIKE.md`
