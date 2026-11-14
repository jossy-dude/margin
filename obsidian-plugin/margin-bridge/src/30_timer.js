/* ── the shared focus timer (v0.7.1) ──────────────────────────────────────────────────────────────
 * ONE timer across Margin, phone Obsidian and desktop Obsidian, held by the desktop hub (bone-syncd,
 * vault-sync/docs/v07/SYNC_PROTOCOL.md §8). This plugin is the transport; Bone Tasks draws the timer.
 *   · phone: frames travel on the live link to Margin, which relays them to the hub;
 *   · desktop: a small link straight to bone-syncd on 127.0.0.1:7428 with the hub's local key
 *     (~/.config/bone-sync/keys.json). The hub already watches the desktop's files, so this link asks for
 *     no file traffic (`files: false`): only the timer and who is online.
 * Other plugins use `app.plugins.plugins['margin-bridge'].timerLink`:
 *   send(op) → start / pause / resume / extend / stop / done; false when no hub is reachable (run locally)
 *   on(fn)   → the hub's timer state whenever it changes (with `offset` = hub clock − this clock); returns off()
 *   me       → this device's id, to compare with the timer's `owner` (the device that records the session)
 *   online   → is a hub reachable right now
 */
const DESK = { dev: 'margin-bridge-desk-device', off: 'margin-bridge-desk-off' };
class TimerLink {
  constructor(plugin) { this.p = plugin; this.app = plugin.app; this.subs = new Set(); this.last = null; this.desk = null; this.retry = null; this.wait = 15000; this.stopped = false; }
  get deskId() { let d = this.app.loadLocalStorage(DESK.dev); if (!d) { d = BoneSyncCore.newId(); this.app.saveLocalStorage(DESK.dev, d); } return d; }
  get phoneLink() { const l = this.p.live?.link; return l?.ready ? l : null; }
  get deskLink() { return this.desk?.ready ? this.desk : null; }
  get online() { return !!(this.phoneLink || this.deskLink); }
  get me() { return this.phoneLink ? this.p.live.deviceId : this.deskLink ? this.deskId : (obsidian.Platform.isMobile ? this.p.live?.deviceId : this.deskId); }
  send(op) {
    const l = this.phoneLink || this.deskLink;
    if (!l) return false;
    try { l.send(l.frame('timer', { ...op })); return true; } catch (e) { console.error('Margin timer: send', e); return false; }
  }
  on(fn) { this.subs.add(fn); if (this.last) { try { fn(this.last); } catch (e) { console.error(e); } } return () => this.subs.delete(fn); }
  /** A frame from either link. Raw ops relayed from another client carry no `status`: not state, skipped. */
  receive(m) {
    if (!m || !m.status || !m.timerId) return;
    this.last = { ...m, offset: (Number(m.serverTime) || Date.now()) - Date.now() };
    for (const f of this.subs) { try { f(this.last); } catch (e) { console.error('Margin timer: listener', e); } }
  }

  /** Desktop only, and only where bone-syncd is installed (its keys file exists). Retries with back-off. */
  startDesktop() {
    if (!obsidian.Platform.isDesktopApp || this.app.loadLocalStorage(DESK.off) === 'true') return;
    let keys = null;
    try {
      const fs = require('fs'), os = require('os'), path = require('path');
      keys = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config', 'bone-sync', 'keys.json'), 'utf8'));
    } catch { return; }   // no hub on this computer: nothing to do, and nothing to complain about
    if (!keys?.local || !keys?.vaultId) return;
    const open = () => {
      if (this.stopped || this.desk) return;
      this.desk = BoneSyncCore.connect({
        url: globalThis.__marginHubUrl || 'ws://127.0.0.1:7428', deviceId: this.deskId, name: 'Obsidian (desktop)', role: 'desktop-obsidian',
        app: this.p.manifest.version, key: keys.local, vault: keys.vaultId, cursor: Number.MAX_SAFE_INTEGER,
        onFrame: (m) => {
          if (m.t === 'timer') this.receive(m);
          else if (m.t === 'changed') reloadPluginData(this.app, m.p);
          else if (m.t === 'presence') { this.peers = m.peers; this.p.liveChanged?.(this.p.liveState); }
        },
        onState: (s) => {
          if (s === 'ready') { this.wait = 15000; this.p.liveChanged?.(this.p.liveState); }
          if (s === 'closed' || s === 'error') {
            this.desk = null;
            if (this.stopped) return;
            clearTimeout(this.retry);
            this.retry = setTimeout(open, this.wait); this.wait = Math.min(this.wait * 2, 5 * 60_000);
          }
        },
        log: () => {},
        hello: { files: false },
      });
    };
    open();
  }
  stop() { this.stopped = true; clearTimeout(this.retry); if (this.desk) { try { this.desk.close(); } catch { /* */ } this.desk = null; } }
}

/** A file of a plugin changed under it through sync (phone: Margin wrote it, and Obsidian reports no events for its
 *  config folder; desktop: the hub wrote it). Ask the plugin to reload, so its next save does not put back what it
 *  had in memory: `data.json` → Obsidian's own `onExternalSettingsChange()`; any other file (chess studies.json,
 *  YT history.json) → `onExternalFileChange(name)`, a Bone convention. */
async function reloadPluginData(app, p) {
  const m = /^\.obsidian\/plugins\/([^/]+)\/(.+)$/.exec(p || '');
  const pl = m && app.plugins?.plugins?.[m[1]];
  if (!pl) return;
  try {
    if (m[2] === 'data.json') { if (typeof pl.onExternalSettingsChange === 'function') await pl.onExternalSettingsChange(); }
    else if (typeof pl.onExternalFileChange === 'function') await pl.onExternalFileChange(m[2]);
  } catch (e) { console.error(`Margin sync: ${m[1]} could not reload ${m[2]}`, e); }
}
