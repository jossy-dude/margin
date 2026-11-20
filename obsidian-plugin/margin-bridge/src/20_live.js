/* ── the thin link to Margin (v0.8, phone only) ───────────────────────────────────────────────────
 * Phone Obsidian is a client of Margin on 127.0.0.1:7429 while it is in front:
 *   · connect on `visible` (ping first, reconnect without a pong in 2 s), close 5 s after `hidden`;
 *   · typing in a note sends `hint editing <path>` (at most every 5 s); 2 s after the last save it sends
 *     `hint saved <path>`; Margin holds its own writes to that note in between;
 *   · `changed <path>` from Margin: the file was rewritten on disk; Obsidian re-reads it (the open editor updates);
 *     `changed` with `plugin`: a plugin was updated from the desktop and is reloaded;
 *   · the link is sealed (seal 2) even on loopback; the key comes from `link.local.json`, which Margin writes.
 */
const LIVE_URL = 'ws://127.0.0.1:7429';
const liveUrl = () => globalThis.__marginLiveUrl || LIVE_URL;
const LINK_FILE = '.obsidian/plugins/margin-bridge/link.local.json';
const LS = { key: 'margin-bridge-sync-key', dev: 'margin-bridge-sync-device', on: 'margin-bridge-sync-on' };
const EDIT_EVERY_MS = 5000, SAVED_AFTER_MS = 2000;

class LiveSync {
  constructor(plugin) {
    this.p = plugin; this.app = plugin.app;
    this.link = null; this.hideTimer = null; this.pongTimer = null;
    this.editingAt = new Map();   // path → when the last "editing" hint went
    this.savedT = new Map();      // path → timer for its "saved" hint
    this.state = 'off';
  }
  ls(k, v) { if (v === undefined) return this.app.loadLocalStorage(k); this.app.saveLocalStorage(k, v); }
  get enabled() { return this.ls(LS.on) === 'true' && !!this.ls(LS.key); }
  get deviceId() { let d = this.ls(LS.dev); if (!d) { d = BoneSyncCore.newId(); this.ls(LS.dev, d); } return d; }

  /** Margin leaves the key here (device-local class: never synced). */
  async loadKey() {
    try {
      const j = JSON.parse(await this.app.vault.adapter.read(LINK_FILE));
      if (/^[0-9a-f]{64}$/.test(j.key)) { if (this.ls(LS.key) !== j.key) this.ls(LS.key, j.key); this.ls(LS.on, 'true'); return true; }
    } catch { /* not written yet: Margin has not run with this vault */ }
    return false;
  }
  /** Margin before 0.8: the 6-digit code from Settings → Sync → "Connect phone Obsidian". */
  async pairWithCode(code) {
    const digits = String(code).replace(/\D/g, '');
    if (digits.length !== 6) throw new Error('The code has six digits.');
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(digits), 'HKDF', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('bone-sync/1 local'), info: new TextEncoder().encode('bone-sync/1 obsidian') }, base, 256);
    this.ls(LS.key, BoneSyncCore.hex(bits)); this.ls(LS.on, 'true');
    this.close(); this.open();
  }
  forget() { this.ls(LS.key, ''); this.ls(LS.on, 'false'); this.close(); this.setState('off'); }

  start() {
    if (!obsidian.Platform.isMobile) return;
    const p = this.p;
    p.registerDomEvent(document, 'visibilitychange', () => (document.hidden ? this.onHidden() : this.onVisible()));
    p.registerEvent(this.app.workspace.on('editor-change', (_ed, info) => this.editing(info?.file?.path)));
    p.registerEvent(this.app.vault.on('modify', (f) => this.armSaved(f.path)));
    p.registerEvent(this.app.vault.on('create', (f) => this.armSaved(f.path)));
    p.registerEvent(this.app.vault.on('delete', (f) => this.armSaved(f.path)));
    p.registerEvent(this.app.vault.on('rename', (f, old) => { this.armSaved(old); this.armSaved(f.path); }));
    this.app.workspace.onLayoutReady(async () => { await this.loadKey(); if (!document.hidden) this.open(); });
  }
  stop() { this.flushAll(); this.close(); }
  setState(s, note) { this.state = s; this.p.liveChanged?.(s, note); }

  // ── hints ──
  hint(op, p) { const l = this.link; if (p && l?.ready) l.send(l.frame('hint', { op, p })); }
  editing(path) {
    if (!path) return;
    const t = Date.now();
    if (t - (this.editingAt.get(path) || 0) >= EDIT_EVERY_MS) { this.editingAt.set(path, t); this.hint('editing', path); }
    this.armSaved(path);
  }
  armSaved(path) {
    if (!path || path.startsWith('.obsidian/')) return;
    clearTimeout(this.savedT.get(path));
    this.savedT.set(path, setTimeout(() => { this.savedT.delete(path); this.editingAt.delete(path); this.hint('saved', path); }, SAVED_AFTER_MS));
  }
  flushAll() { for (const [p, t] of this.savedT) { clearTimeout(t); this.hint('saved', p); } this.savedT.clear(); this.editingAt.clear(); }

  onVisible() {
    clearTimeout(this.hideTimer);
    if (!this.enabled) { this.loadKey().then((ok) => { if (ok) this.open(); }); return; }
    if (this.link?.ready) {
      this.link.ping();
      clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => { this.close(); this.open(); }, 2000);
    } else this.open();
  }
  onHidden() {
    clearTimeout(this.hideTimer);
    this.flushAll();
    this.hideTimer = setTimeout(() => this.close(), 5000);
  }

  open() {
    if (!this.enabled || this.link) return;
    this.setState('connecting');
    const link = this.link = BoneSyncCore.connect({
      url: liveUrl(), deviceId: this.deviceId, name: 'Obsidian (phone)', role: 'phone-obsidian', app: this.p.manifest?.version ?? '0.8.0',
      key: this.ls(LS.key), vault: null, cursor: 0, hello: { files: false },
      onFrame: (m) => this.onFrame(m).catch((e) => console.error('Margin link', e)),
      onState: (s) => {
        if (this.link !== link) return;
        if (s === 'ready') { this.setState('live'); this.p.timerLink?.linkReady(link); }
        if (s === 'closed' || s === 'error') { this.link = null; this.setState(this.enabled ? 'waiting' : 'off'); }
      },
      log: (s) => console.log('Margin link:', s),
    });
  }
  close() { clearTimeout(this.pongTimer); if (this.link) { try { this.link.send(this.link.frame('bye', { reason: 'hidden' })); } catch { /* */ } this.link.close(); this.link = null; } }

  // ── from Margin ──
  async onFrame(m) {
    if (m.t === 'pong') { clearTimeout(this.pongTimer); return; }
    if (m.t === 'bye' && m.reason === 'bad-proof') { this.setState('waiting', 'Margin did not accept this link. Open Margin once so it writes a new key.'); await this.loadKey(); return; }
    if (m.t === 'bye' && m.reason === 'busy') { this.setState('waiting'); return; }
    if (m.t === 'rekey') return this.onRekey(m);
    if (m.t === 'hold') return this.onHold(m);
    if (m.t === 'conflict') { if (m.resolution === 'conflicts-note') new obsidian.Notice(`Sync: a clash in ${String(m.p).split('/').pop()}. The other version is in ${m.file}.`); return; }
    if (m.t === 'presence') { this.peers = m.peers; this.p.liveChanged?.(this.state); return; }
    if (m.t === 'timer') { this.p.timerLink?.receive(m); return; }
    if (m.t === 'changed') return m.plugin ? reloadPlugin(this.app, m.plugin) : reread(this.app, m.p);
  }
  onRekey(m) {
    if (!/^[0-9a-f]{64}$/.test(m.key)) return;
    this.ls(LS.key, m.key);
    this.link?.send(this.link.frame('ack', { ref: m.id, ok: true }));
  }
  /** The hub stopped a big delete: ask here too (the owner can answer on the desktop, in Margin, or here). */
  onHold(m) {
    if (m.op === 'done') { this.holdModal?.close(); this.holdModal = null; if (m.result) new obsidian.Notice(m.result === 'apply' ? 'Sync: the deletes went through.' : 'Sync: the deleted files are coming back.'); return; }
    if (m.op !== 'held' || !obsidian.Modal) return;
    this.holdModal?.close();
    const md = new obsidian.Modal(this.app); this.holdModal = md;
    const answer = (op) => { this.link?.send(this.link.frame('hold', { op, holdId: m.holdId })); md.close(); };
    md.titleEl?.setText?.(`Sync stopped: ${m.count} files deleted on the ${m.from}`);
    md.contentEl.createEl('p', { text: `Do you want to sync the deletes? For example: ${(m.sample || []).join(', ')}` });
    const row = md.contentEl.createDiv();
    row.createEl('button', { text: 'Delete them here too', cls: 'mod-warning' }).onclick = () => answer('apply');
    row.createEl('button', { text: 'Keep the files' }).onclick = () => answer('cancel');
    md.open();
  }
}

/** Margin rewrote `p` on disk. Obsidian on Android does not watch the disk, so ask it to look again: the adapter's
 *  own reconcile when this Obsidian has one, else the text goes through the vault API (open editors update). A
 *  file in `.obsidian/` belongs to a plugin: that plugin reloads its data. */
async function reread(app, p) {
  if (!p) return;
  if (p.startsWith('.obsidian/')) return reloadPluginData(app, p);
  const ad = app.vault.adapter;
  try {
    for (const fn of ['reconcileFile', 'reconcileFileChanged']) {
      if (typeof ad[fn] === 'function') { await ad[fn](p, p); return; }
    }
  } catch (e) { console.warn('Margin link: reconcile', e); }
  const f = app.vault.getAbstractFileByPath(p);
  if (!(await ad.exists(p))) { if (f instanceof obsidian.TFile) await app.vault.delete(f).catch(() => {}); return; }
  const disk = await ad.read(p);
  if (f instanceof obsidian.TFile) { if ((await app.vault.read(f)) !== disk) await app.vault.modify(f, disk); }
  else {
    const dir = p.split('/').slice(0, -1).join('/');
    if (dir && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir).catch(() => {});
    // the file exists on disk but Obsidian does not know it yet: let its file list catch up
    try { await ad.reconcileFolderCreation?.(dir, dir); } catch { /* */ }
  }
}
/** A plugin's code changed under it (an update from the desktop): turn it off and on again. */
async function reloadPlugin(app, id) {
  const pl = app.plugins;
  if (!pl?.enabledPlugins?.has?.(id) || id === 'margin-bridge') return;
  try { await pl.disablePlugin(id); await pl.enablePlugin(id); new obsidian.Notice(`Updated ${pl.manifests?.[id]?.name ?? id}`); } catch (e) { console.error(`Margin link: reload ${id}`, e); }
}
