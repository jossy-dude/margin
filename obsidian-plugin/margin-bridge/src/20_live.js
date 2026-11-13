/* ── live sync (v0.7, bone-sync/1) ─────────────────────────────────────────────────────────────────
 * Phone Obsidian ("O" in vault-sync/docs/v07/SYNC_PROTOCOL.md) is a client of Margin on 127.0.0.1:7429.
 * Margin keeps the link to the desktop hub; this side only runs while Obsidian is in front:
 *   · connect on `visible`, ping first and reconnect if no pong within 2 s (sockets are half-dead after resume);
 *   · close 5 s after `hidden` (Margin then writes the vault itself); no timers at all while hidden;
 *   · edits leave 1.5 s after the last keystroke per file, as one `put` with the base both sides agreed on;
 *   · what arrives is written through the vault API (`vault.process`), so the open editor updates cleanly.
 * Per-device state (the key, the device id, the per-file base hashes) is in local storage, never in data.json:
 * data.json travels with the vault.
 */
const LIVE_URL = 'ws://127.0.0.1:7429';
const liveUrl = () => globalThis.__marginLiveUrl || LIVE_URL; // tests point it at a local hub
const LS = { key: 'margin-bridge-sync-key', dev: 'margin-bridge-sync-device', files: 'margin-bridge-sync-files', cursor: 'margin-bridge-sync-cursor', on: 'margin-bridge-sync-on' };
const TEXT_RE = /\.(md|canvas|base|txt|css|js|mjs|py|csv|json)$/i;
const b64 = (buf) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;

class LiveSync {
  constructor(plugin) {
    this.p = plugin; this.app = plugin.app;
    this.link = null; this.hideTimer = null; this.pongTimer = null;
    this.pending = new Map();   // path → timeout (debounced edits)
    this.applying = new Set();  // paths being written from the wire (their modify events are ours)
    this.files = this.load(LS.files, {});  // path → { h, base }
    this.ignore = BoneSyncCore.compileIgnore();
    this.state = 'off';
  }
  ls(k, v) { if (v === undefined) return this.app.loadLocalStorage(k); this.app.saveLocalStorage(k, v); }
  load(k, d) { try { return JSON.parse(this.ls(k) || '') || d; } catch { return d; } }
  saveFiles() { this.ls(LS.files, JSON.stringify(this.files)); }
  get enabled() { return this.ls(LS.on) === 'true' && !!this.ls(LS.key); }
  get deviceId() { let d = this.ls(LS.dev); if (!d) { d = BoneSyncCore.newId(); this.ls(LS.dev, d); } return d; }

  /** The 6-digit code from Margin → Settings → Sync → "Connect phone Obsidian". */
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
    const p = this.p;
    p.registerDomEvent(document, 'visibilitychange', () => (document.hidden ? this.onHidden() : this.onVisible()));
    p.registerEvent(this.app.vault.on('modify', (f) => this.local(f.path)));
    p.registerEvent(this.app.vault.on('create', (f) => this.local(f.path)));
    p.registerEvent(this.app.vault.on('delete', (f) => this.localDelete(f.path)));
    p.registerEvent(this.app.vault.on('rename', (f, old) => this.localRename(old, f.path)));
    this.app.workspace.onLayoutReady(() => { if (!document.hidden) this.open(); });
  }
  stop() { this.close(); for (const t of this.pending.values()) clearTimeout(t); }
  setState(s, note) { this.state = s; this.p.liveChanged?.(s, note); }

  onVisible() {
    clearTimeout(this.hideTimer);
    if (!this.enabled) return;
    if (this.link?.ready) {
      // a socket from before the pause may be half-dead: no pong in 2 s → reconnect
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
    const cursor = Number(this.ls(LS.cursor) || 0);
    this.link = BoneSyncCore.connect({
      url: liveUrl(), deviceId: this.deviceId, name: 'Obsidian (phone)', role: 'phone-obsidian', app: this.p.manifest.version,
      key: this.ls(LS.key), vault: null, cursor,
      onFrame: (m) => this.onFrame(m).catch((e) => console.error('Margin live sync', e)),
      onState: (s) => {
        if (s === 'ready') this.setState('live');
        if (s === 'closed' || s === 'error') { this.link = null; this.setState(this.enabled ? 'waiting' : 'off', s === 'error' ? 'Margin is not reachable' : undefined); }
      },
      log: (s) => console.log('Margin live sync:', s),
    });
  }
  close() { clearTimeout(this.pongTimer); if (this.link) { try { this.link.send(this.link.frame('bye', { reason: 'hidden' })); } catch { /* */ } this.link.close(); this.link = null; } }

  // ── incoming ──
  async onFrame(m) {
    if (m.t === 'pong') { clearTimeout(this.pongTimer); return; }
    if (m.t === 'bye' && m.reason === 'bad-proof') { this.ls(LS.on, 'false'); this.setState('off', 'Margin did not accept the code; get a new one in Margin.'); return; }
    if (m.seq) this.ls(LS.cursor, String(Math.max(Number(this.ls(LS.cursor) || 0), m.seq)));
    if (m.t === 'manifest') return this.reconcile(m);
    if (m.t === 'put') return this.applyPut(m);
    if (m.t === 'del') return this.applyDel(m);
    if (m.t === 'mv') return this.applyMv(m);
    if (m.t === 'ack') return this.onAck(m);
    if (m.t === 'conflict') { new obsidian.Notice(`Merged edits in ${m.p.split('/').pop()} (phone + desktop)`); return; }
    if (m.t === 'presence') { this.peers = m.peers; this.p.liveChanged?.(this.state); }
  }
  skip(p) { return this.ignore(p) || p.startsWith('.obsidian/'); }
  async hashOf(path) {
    const ad = this.app.vault.adapter;
    if (!(await ad.exists(path))) return null;
    return BoneSyncCore.hashOf(TEXT_RE.test(path) ? await ad.read(path) : new Uint8Array(await ad.readBinary(path)));
  }
  async reconcile(m) {
    const want = [];
    for (const f of m.files) {
      if (this.skip(f.p)) continue;
      const rec = this.files[f.p];
      const local = await this.hashOf(f.p);
      if (f.h === null) { if (local && rec && local === rec.base) await this.applyDel({ p: f.p }); continue; }
      if (local === f.h) { this.files[f.p] = { h: f.h, base: f.h }; continue; }
      if (!local || (rec && local === rec.base)) want.push(f.p);
      else this.send(f.p, rec?.base ?? null);   // changed here (and maybe there): the hub merges
    }
    this.saveFiles();
    if (want.length) this.link?.send(this.link.frame('want', { paths: want }));
  }
  async write(path, data, isText) {
    const v = this.app.vault, f = v.getAbstractFileByPath(path);
    this.applying.add(path);
    try {
      if (f instanceof obsidian.TFile) {
        if (isText) await v.process(f, () => data); else await v.modifyBinary(f, data);
      } else {
        const dir = path.split('/').slice(0, -1).join('/');
        if (dir && !v.getAbstractFileByPath(dir)) await v.createFolder(dir).catch(() => {});
        if (isText) await v.create(path, data); else await v.createBinary(path, data);
      }
    } finally { setTimeout(() => this.applying.delete(path), 1500); }
  }
  async applyPut(m) {
    if (this.skip(m.p)) return;
    let data, isText = m.enc !== 'bin';
    if (m.enc === 'patch') {
      const rec = this.files[m.p];
      const cur = await this.hashOf(m.p);
      if (!rec || cur !== m.base) { this.link?.send(this.link.frame('want', { paths: [m.p] })); return; }
      data = BoneSyncCore.applyPatch(await this.app.vault.adapter.read(m.p), m.patch);
    } else data = m.enc === 'bin' ? unb64(m.body) : m.body;
    const h = await BoneSyncCore.hashOf(isText ? data : new Uint8Array(data));
    if (h !== m.h) { this.link?.send(this.link.frame('want', { paths: [m.p] })); return; }
    // an unsent local edit to the same file: send it with its base first; the hub merges and sends the result
    const rec = this.files[m.p], cur = await this.hashOf(m.p);
    if (rec && cur && cur !== rec.base && cur !== h) { this.send(m.p, rec.base); return; }
    await this.write(m.p, data, isText);
    this.files[m.p] = { h, base: h }; this.saveFiles();
    this.link?.send(this.link.frame('ack', { ref: m.id, ok: true, seq: m.seq, h }));
  }
  async applyDel(m) {
    const f = this.app.vault.getAbstractFileByPath(m.p);
    const rec = this.files[m.p];
    if (f instanceof obsidian.TFile) {
      if (rec && (await this.hashOf(m.p)) !== rec.base) return; // edited here: an edit beats a delete
      this.applying.add(m.p);
      await this.app.vault.delete(f).catch(() => {});
    }
    delete this.files[m.p]; this.saveFiles();
  }
  async applyMv(m) {
    const f = this.app.vault.getAbstractFileByPath(m.from);
    if (!(f instanceof obsidian.TFile)) { this.link?.send(this.link.frame('want', { paths: [m.to] })); return; }
    this.applying.add(m.from); this.applying.add(m.to);
    await this.app.fileManager.renameFile(f, m.to);
    if (this.files[m.from]) { this.files[m.to] = this.files[m.from]; delete this.files[m.from]; this.saveFiles(); }
  }
  onAck(m) {
    const sent = this.inflight?.get(m.ref);
    if (!sent) return;
    this.inflight.delete(m.ref);
    if (m.ok) {
      const p = m.renamed ?? sent.p;
      this.files[p] = { h: m.h, base: m.h }; this.saveFiles();
    } else if (m.err === 'need-full') this.send(sent.p, sent.base, true);
  }

  // ── outgoing ──
  local(path) {
    // no `applying` check here: a real edit right after an incoming write must still go out. The echo of our
    // own write is dropped in send(), where its hash equals the base we just recorded.
    if (!this.link || this.skip(path)) return;
    clearTimeout(this.pending.get(path));
    this.pending.set(path, setTimeout(() => { this.pending.delete(path); this.send(path, this.files[path]?.base ?? null); }, 1500));
  }
  flushAll() { for (const [p, t] of this.pending) { clearTimeout(t); this.send(p, this.files[p]?.base ?? null); } this.pending.clear(); }
  async send(path, base, full = false) {
    if (!this.link?.ready) return;
    const ad = this.app.vault.adapter;
    if (!(await ad.exists(path))) return;
    const isText = TEXT_RE.test(path);
    const data = isText ? await ad.read(path) : await ad.readBinary(path);
    const h = await BoneSyncCore.hashOf(isText ? data : new Uint8Array(data));
    if (h === base) return;
    const stat = await ad.stat(path);
    const f = { p: path, h, base, s: stat?.size ?? 0, m: stat?.mtime ?? Date.now() };
    if (!isText) Object.assign(f, { enc: 'bin', body: b64(data) });
    else Object.assign(f, { enc: 'text', body: data });
    void full;
    const fr = this.link.frame('put', f);
    (this.inflight ??= new Map()).set(fr.id, { p: path, base });
    this.files[path] = { h, base }; this.saveFiles();
    this.link.send(fr);
  }
  localDelete(path) {
    if (!this.link || this.applying.has(path) || this.skip(path)) return;
    const rec = this.files[path];
    this.link.send(this.link.frame('del', { p: path, base: rec?.base ?? null }));
    delete this.files[path]; this.saveFiles();
  }
  localRename(from, to) {
    if (!this.link || this.applying.has(to) || this.skip(to)) return;
    const rec = this.files[from];
    this.link.send(this.link.frame('mv', { from, to, h: rec?.h ?? null }));
    if (rec) { this.files[to] = rec; delete this.files[from]; this.saveFiles(); }
  }
}
