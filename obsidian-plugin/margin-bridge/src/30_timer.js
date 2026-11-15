/* ── the shared focus timer (v0.7.1) ──────────────────────────────────────────────────────────────
 * ONE timer across Margin, phone Obsidian and desktop Obsidian, held by the desktop hub (bone-syncd,
 * vault-sync/docs/v07/SYNC_PROTOCOL.md §8). This plugin is the transport; Bone Tasks draws the timer.
 *   · phone: frames travel on the live link to Margin, which relays them to the hub;
 *   · desktop: a small link straight to bone-syncd on 127.0.0.1:7428 with the hub's local key
 *     (~/.config/bone-sync/keys.json). The hub already watches the desktop's files, so this link asks for
 *     no file traffic (`files: false`): only the timer and who is online.
 * Other plugins use `app.plugins.plugins['margin-bridge'].timerLink`:
 *   send(op) → start / pause / resume / extend / stop / done / skip / reset / break. Every op is stamped with
 *              `at` (when it happened, hub clock) and `baseRev` (the state it was made on), so the hub can order
 *              ops from two devices and replay offline ones correctly (sync-core timer.js). Returns false when no
 *              hub is reachable: the op is then queued (kept across restarts) and sent on the next connect.
 *   on(fn)   → the hub's timer state whenever it changes (with `offset` = hub clock − this clock); returns off().
 *              Frames older than the one already shown (by rev/epoch) are dropped, never shown.
 *   me       → this device's id, to compare with the timer's `owner` (the device that records the session)
 *   online   → is a hub reachable right now
 */
const DESK = { dev: 'margin-bridge-desk-device', off: 'margin-bridge-desk-off', queue: 'margin-bridge-timer-queue', last: 'margin-bridge-timer-last' };
const QUEUE_MAX = 20, QUEUE_AGE_MS = 12 * 3600_000, HOLD_MS = 4000;
class TimerLink {
  constructor(plugin) {
    this.p = plugin; this.app = plugin.app; this.subs = new Set(); this.desk = null; this.retry = null; this.wait = 15000; this.stopped = false;
    // the last hub state shown (kept across restarts so an old frame can't roll the screen back after one)
    this.last = this.loadJson(DESK.last, null);
    this.queue = this.loadJson(DESK.queue, []);     // ops made while no hub was reachable
    this.held = null;                                 // after replaying the queue: { ids, timer, latest } until answered
  }
  loadJson(k, d) { try { const v = this.app.loadLocalStorage(k); return v ? JSON.parse(v) : d; } catch { return d; } }
  saveJson(k, v) { try { this.app.saveLocalStorage(k, v == null ? null : JSON.stringify(v)); } catch { /* */ } }
  /** hub clock − this clock: the live link's (re-measured on every pong), else the last frame's. */
  get offset() { const l = this.phoneLink || this.deskLink; return Number.isFinite(l?.offset) ? l.offset : (this.last?.offset ?? 0); }
  get deskId() { let d = this.app.loadLocalStorage(DESK.dev); if (!d) { d = BoneSyncCore.newId(); this.app.saveLocalStorage(DESK.dev, d); } return d; }
  get phoneLink() { const l = this.p.live?.link; return l?.ready ? l : null; }
  get deskLink() { return this.desk?.ready ? this.desk : null; }
  get online() { return !!(this.phoneLink || this.deskLink); }
  get me() { return this.phoneLink ? this.p.live.deviceId : this.deskLink ? this.deskId : (obsidian.Platform.isMobile ? this.p.live?.deviceId : this.deskId); }
  send(op) {
    const fields = { ...op, at: Number.isFinite(op.at) ? op.at : Date.now() + this.offset, baseRev: Number.isFinite(op.baseRev) ? op.baseRev : (this.last?.rev ?? 0) };
    const l = this.phoneLink || this.deskLink;
    if (l) {
      try { l.send(l.frame('timer', fields)); return true; } catch (e) { console.error('Margin timer: send', e); }
    }
    // no hub right now: keep it, in order, and send it on the next connect (the hub decides by `at`/`baseRev`)
    this.queue = [...this.queue, { ...fields, queuedAt: Date.now() }].slice(-QUEUE_MAX);
    this.saveJson(DESK.queue, this.queue);
    return false;
  }
  /** A link came up: replay the queued ops, and hold the screen still until the hub has answered them (or 4 s),
   *  so the state from before the replay never flashes up (a timer that "ended" and then comes back paused). */
  linkReady(l) {
    if (!l || !this.queue.length) return;
    const fresh = this.queue.filter((o) => Date.now() - (o.queuedAt || 0) < QUEUE_AGE_MS);
    this.queue = []; this.saveJson(DESK.queue, []);
    if (!fresh.length) return;
    const ids = new Set();
    for (const o of fresh) { const { queuedAt, ...op } = o; const fr = l.frame('timer', op); ids.add(fr.id); try { l.send(fr); } catch (e) { console.error('Margin timer: replay', e); } }
    clearTimeout(this.held?.timer);
    this.held = { ids, latest: null, timer: setTimeout(() => this.release(), HOLD_MS) };
  }
  release() { const h = this.held; this.held = null; if (h) clearTimeout(h.timer); if (h?.latest) this.deliver(h.latest); }
  on(fn) { this.subs.add(fn); if (this.last) { try { fn(this.last); } catch (e) { console.error(e); } } return () => this.subs.delete(fn); }
  /** A frame from either link. Raw ops relayed from another client carry no `status`: not state, skipped (but an
   *  answer to one of our replayed ops still counts as heard). Older frames than the one shown are dropped. */
  receive(m) {
    if (!m) return;
    if (this.held && m.ref && this.held.ids.delete(m.ref) && !this.held.ids.size) { if (m.status && m.timerId) this.held.latest = this.pick(this.held.latest, m); this.release(); return; }
    if (!m.status || !m.timerId) return;
    if (this.held) { this.held.latest = this.pick(this.held.latest, m); return; }
    this.deliver(m);
  }
  pick(a, b) { return !a || BoneSyncCore.newerTimer(a, b) ? b : a; }
  deliver(m) {
    if (!BoneSyncCore.newerTimer(this.last, m)) return;
    const l = this.phoneLink || this.deskLink;
    this.last = { ...m, offset: Number.isFinite(l?.offset) ? l.offset : (Number(m.serverTime) || Date.now()) - Date.now() };
    this.saveJson(DESK.last, this.last);
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
          if (s === 'ready') { this.wait = 15000; this.linkReady(this.desk); this.p.liveChanged?.(this.p.liveState); }
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
  stop() { this.stopped = true; clearTimeout(this.retry); clearTimeout(this.held?.timer); if (this.desk) { try { this.desk.close(); } catch { /* */ } this.desk = null; } }
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
