/**
 * v0.7 N5 (PLAN.md Phase 2): the sync service's manifest entries and dependencies. Source checks: Gradle runs
 * only in CI, so these keep a careless edit from dropping a permission the service needs to start at all.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MOD = join(__dirname, '..', '..', 'modules', 'margin-native', 'android');
const manifest = readFileSync(join(MOD, 'src', 'main', 'AndroidManifest.xml'), 'utf8');
const gradle = readFileSync(join(MOD, 'build.gradle'), 'utf8');

describe('sync service wiring (SYNC_ANDROID.md §2)', () => {
  it('declares a connectedDevice foreground service with its prerequisites, and no location permission', () => {
    for (const p of ['FOREGROUND_SERVICE_CONNECTED_DEVICE', 'CHANGE_NETWORK_STATE', 'ACCESS_NETWORK_STATE', 'ACCESS_WIFI_STATE', 'INTERNET']) {
      expect(manifest).toContain(`android.permission.${p}"`);
    }
    expect(manifest).toMatch(/SyncService"[^>]*foregroundServiceType="connectedDevice"/);
    expect(manifest).toMatch(/SyncJob"[^>]*BIND_JOB_SERVICE/);
    // networks are keyed by a LinkProperties fingerprint, never by SSID/BSSID (owner's rule)
    expect(manifest).not.toMatch(/ACCESS_(FINE|COARSE|BACKGROUND)_LOCATION/);
  });
  it('uses the OkHttp React Native already ships and Java-WebSocket 1.6.0', () => {
    expect(gradle).toContain("com.squareup.okhttp3:okhttp:4.9.2");
    expect(gradle).toContain("org.java-websocket:Java-WebSocket:1.6.0");
  });
});

describe('widgets do not wake the phone on a timer (PLAN N7, found issue F4)', () => {
  it('updatePeriodMillis is 0: TICK at class boundaries and data changes redraw them instead', () => {
    const xml = readFileSync(join(MOD, 'src', 'main', 'res', 'xml', 'mg_widget_board.xml'), 'utf8');
    expect(xml).toContain('android:updatePeriodMillis="0"');
  });
});
