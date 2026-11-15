/* ── live sync (v0.7, bone-sync/1) ─────────────────────────────────────────────────────────────────
 * Phone Obsidian ("O" in vault-sync/docs/v07/SYNC_PROTOCOL.md) is a client of Margin on 127.0.0.1:7429.
 * Margin keeps the link to the desktop hub; this side only runs while Obsidian is in front:
 *   · connect on `visible`, ping first and reconnect if no pong within 2 s (sockets are half-dead after resume);
 *   · close 5 s after `hidden` (Margin then writes the vault itself); no timers at all while hidden;
 *   · edits leave 1.5 s after the last keystroke per file, as one `put` with the base both sides agreed on;
 *   · what arrives is written through the vault API (`vault.process`), so the open editor updates cleanly;
 *   · the link is sealed (seal 2) even on loopback, and the 6-digit code is swapped for a random key on first
 *     contact (`rekey`), so another app on the phone can neither read the stream nor guess the key;
 *   · the cursor moves only after a change is on disk, so a change cut off by closing Obsidian comes again.
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
    // paths deleted or moved from the wire: their delete/rename events are ours. Separate from `applying`, and
    // cleared after the op: an incoming write must never swallow a real delete made right after it (2026-11-15)
    this.removing = new Set();
    this.files = this.load(LS.files, {});  // path → { h, base }
    this.ignore = BoneSyncCore.compileIgnore();
    this.asm = new BoneSyncCore.Assembler();
    this.inflight = new Map();   // frame id (or transfer id) → what we sent, until Margin/the hub acks it
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
    const link = this.link = BoneSyncCore.connect({
      url: liveUrl(), deviceId: this.deviceId, name: 'Obsidian (phone)', role: 'phone-obsidian', app: this.p.manifest.version,
      key: this.ls(LS.key), vault: null, cursor,
      onFrame: (m) => this.onFrame(m).catch((e) => console.error('Margin live sync', e)),
      onState: (s) => {
        // only the current link speaks: after close() + open(), the old socket's late close event used to set
        // `this.link = null` under the new one, so the state said "live" while every edit was dropped (2026-11-15)
        if (this.link !== link) return;
        if (s === 'ready') { this.setState('live'); this.p.timerLink?.linkReady(link); }
        if (s === 'closed' || s === 'error') { this.link = null; this.setState(this.enabled ? 'waiting' : 'off', s === 'error' ? 'Margin is not reachable' : undefined); }
      },
      log: (s) => console.log('Margin live sync:', s),
    });
  }
  close() { clearTimeout(this.pongTimer); if (this.link) { try { this.link.send(this.link.frame('bye', { reason: 'hidden' })); } catch { /* */ } this.link.close(); this.link = null; } }

  // ── incoming ──
  async onFrame(m) {
    if (m.t === 'pong') { clearTimeout(this.pongTimer); return; }
    // anyone listening on Margin's port can say "bad-proof" before proving anything, so sync stays on: it says
    // so and tries again the next time Obsidian comes to the front
    if (m.t === 'bye' && m.reason === 'bad-proof') { this.setState('waiting', 'Margin did not accept this key. If you paired Margin again, get a new code in Margin.'); return; }
    if (m.t === 'bye' && m.reason === 'busy') { this.setState('waiting', 'Margin is busy; trying again soon.'); return; }
    if (m.t === 'rekey') return this.onRekey(m);
    if (m.t === 'hold') return this.onHold(m);
    if (m.t === 'restore') { for (const p of m.paths) if (!this.skip(p)) await this.send(p, null); return; }
    if (m.t === 'manifest') { await this.reconcile(m); return this.bump(m.head); }
    if (m.t === 'put' && m.xfer) {
      let bytes; try { bytes = this.asm.add(m); } catch { return this.want(m.p); }
      if (!bytes) return;
      m = { ...m, id: m.xfer, bytes };
    }
    if (m.t === 'put') { if (await this.applyPut(m)) this.bump(m.seq); return; }
    if (m.t === 'del') { await this.applyDel(m); return this.bump(m.seq); }
    if (m.t === 'mv') { if (await this.applyMv(m)) this.bump(m.seq); return; }
    if (m.t === 'ack') return this.onAck(m);
    if (m.t === 'conflict') { new obsidian.Notice(`Merged edits in ${m.p.split('/').pop()} (phone + desktop)`); return; }
    if (m.t === 'presence') { this.peers = m.peers; this.p.liveChanged?.(this.state); }
    if (m.t === 'timer') { this.p.timerLink?.receive(m); return; }
    // Margin wrote a file in `.obsidian/` that this app cannot watch (a plugin's data.json): let it reload
    if (m.t === 'changed') return reloadPluginData(this.app, m.p);
  }
  bump(seq) { if (seq) this.ls(LS.cursor, String(Math.max(Number(this.ls(LS.cursor) || 0), seq))); }
  want(p) { this.link?.send(this.link.frame('want', { paths: [p] })); return false; }
  onRekey(m) {
    if (!/^[0-9a-f]{64}$/.test(m.key)) return;
    this.ls(LS.key, m.key);
    this.link?.send(this.link.frame('ack', { ref: m.id, ok: true }));
  }
  /** The hub stopped a big delete: ask here too (the owner can answer on the desktop or the phone). */
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
  /** true when the file on disk is now the incoming one (the cursor may move past it). */
  async applyPut(m) {
    if (this.skip(m.p)) return true;
    let data, isText = m.enc !== 'bin';
    if (m.bytes) data = m.bytes.buffer.slice(m.bytes.byteOffset, m.bytes.byteOffset + m.bytes.byteLength);
    else if (m.enc === 'patch') {
      const rec = this.files[m.p];
      const cur = await this.hashOf(m.p);
      if (!rec || cur !== m.base) return this.want(m.p);
      try { data = BoneSyncCore.applyPatch(await this.app.vault.adapter.read(m.p), m.patch); } catch { return this.want(m.p); }
    } else data = m.enc === 'bin' ? unb64(m.body) : m.body;
    const h = await BoneSyncCore.hashOf(isText ? data : new Uint8Array(data));
    if (h !== m.h) return this.want(m.p);
    // a local version the hub has not seen (an unsent edit, or the same new note made here at the same time, e.g.
    // the daily note at midnight): send ours with its base first; the hub merges both and sends the result back.
    // Before, a note made on both sides lost the phone's text (report #3).
    const rec = this.files[m.p], cur = await this.hashOf(m.p);
    if (cur && cur !== h && (!rec || cur !== rec.base)) {
      clearTimeout(this.pending.get(m.p)); this.pending.delete(m.p);
      await this.send(m.p, rec?.base ?? null);
      return false;
    }
    await this.write(m.p, data, isText);
    // confirm it landed before saying so (report #5)
    if ((await this.hashOf(m.p)) !== h) { this.link?.send(this.link.frame('ack', { ref: m.id, ok: false, err: 'write-failed', seq: m.seq })); return this.want(m.p); }
    this.files[m.p] = { h, base: h }; this.saveFiles();
    this.link?.send(this.link.frame('ack', { ref: m.id, ok: true, seq: m.seq, h, p: m.p }));
    return true;
  }
  async applyDel(m) {
    const f = this.app.vault.getAbstractFileByPath(m.p);
    const rec = this.files[m.p];
    if (f instanceof obsidian.TFile) {
      if (rec && (await this.hashOf(m.p)) !== rec.base) return; // edited here: an edit beats a delete
      this.removing.add(m.p);
      try { await this.app.vault.delete(f).catch(() => {}); } finally { setTimeout(() => this.removing.delete(m.p), 1500); }
    }
    delete this.files[m.p]; this.saveFiles();
  }
  async applyMv(m) {
    const f = this.app.vault.getAbstractFileByPath(m.from);
    if (!(f instanceof obsidian.TFile)) return this.want(m.to);
    this.removing.add(m.from); this.removing.add(m.to);
    try { await this.app.fileManager.renameFile(f, m.to); } finally { setTimeout(() => { this.removing.delete(m.from); this.removing.delete(m.to); }, 1500); }
    if (this.files[m.from]) { this.files[m.to] = this.files[m.from]; delete this.files[m.from]; this.saveFiles(); }
    return true;
  }
  onAck(m) {
    const sent = this.inflight.get(m.ref);
    if (!sent) return;
    // a resumable transfer: the hub holds parts 0…have−1; send the rest under the same transfer id
    if (m.err === 'resume' && sent.f) { this.sendRest(m.ref, sent, Number(m.have) || 1).catch((e) => console.error('Margin live sync: resume', e)); return; }
    this.inflight.delete(m.ref);
    if (sent.kind === 'mv') {
      // the hub never had the old name (a new note renamed before it was sent, report P2): send it as new
      if (!m.ok && (m.err === 'missing' || m.err === 'edited')) this.send(sent.to, null);
      return;
    }
    if (m.ok) {
      if (sent.kind !== 'put') return;
      const p = m.renamed ?? sent.p;
      // merged: the hub now holds what we sent, so that is our base; the merged text follows as a put and lands
      // on it cleanly (taking the merged hash as base here made the phone resend its own copy over the merge)
      const h = m.merged ? sent.h : m.h;
      this.files[p] = { h, base: h }; this.saveFiles();
    } else if (m.err === 'need-full' || m.err === 'hash-mismatch' || m.err === 'write-failed') {
      if ((sent.tries ?? 0) < 3) this.send(sent.p, sent.base, sent.tries + 1);
    }
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
  async send(path, base, tries = 0) {
    if (!this.link?.ready) return;
    const ad = this.app.vault.adapter;
    if (!(await ad.exists(path))) return;
    const isText = TEXT_RE.test(path);
    const data = isText ? await ad.read(path) : await ad.readBinary(path);
    const h = await BoneSyncCore.hashOf(isText ? data : new Uint8Array(data));
    if (h === base) return;
    const stat = await ad.stat(path);
    const f = { p: path, h, base, s: stat?.size ?? 0, m: stat?.mtime ?? Date.now() };
    this.files[path] = { h, base }; this.saveFiles();
    if (!isText && BoneSyncCore.needsParts(data.byteLength)) {
      // resumable (when Margin and the hub say so): part 0 first, then the rest from where the answer says, so a
      // transfer cut off by a closed app or a network switch goes on instead of starting over (2026-11-15)
      if (this.link.resume) {
        const first = BoneSyncCore.partsOf(f, new Uint8Array(data)).next().value;
        this.inflight.set(first.xfer, { kind: 'put', p: path, h, base, tries, f });
        await this.link.send(this.link.frame('put', { ...first, resumable: true }));
        return;
      }
      // a big binary goes in 1 MB parts; the hub acks the transfer id
      let xfer = null;
      for (const part of BoneSyncCore.partsOf(f, new Uint8Array(data))) { xfer = part.xfer; await this.link?.send(this.link.frame('put', part)); }
      if (xfer) this.inflight.set(xfer, { kind: 'put', p: path, h, base, tries });
      return;
    }
    Object.assign(f, isText ? { enc: 'text', body: data } : { enc: 'bin', body: b64(data) });
    const fr = this.link.frame('put', f);
    this.inflight.set(fr.id, { kind: 'put', p: path, h, base, tries });
    this.link.send(fr);
  }
  async sendRest(xfer, sent, from) {
    const bytes = new Uint8Array(await this.app.vault.adapter.readBinary(sent.p));
    // changed since part 0 went out: drop this transfer, the change is sent as a new one
    if ((await BoneSyncCore.hashOf(bytes)) !== sent.h) { this.inflight.delete(xfer); this.local(sent.p); return; }
    for (const part of BoneSyncCore.partsOf(sent.f, bytes, BoneSyncCore.PART_BYTES, { xfer, from })) await this.link?.send(this.link.frame('put', part));
  }
  localDelete(path) {
    if (!this.link || this.removing.has(path) || this.skip(path)) return;
    clearTimeout(this.pending.get(path)); this.pending.delete(path);
    const rec = this.files[path];
    this.link.send(this.link.frame('del', { p: path, base: rec?.base ?? null }));
    delete this.files[path]; this.saveFiles();
  }
  localRename(from, to) {
    if (!this.link || this.removing.has(to) || this.skip(to)) return;
    const rec = this.files[from];
    // never sent yet (still in its 1.5 s wait, or new): it is simply a new file under the new name
    if (this.pending.has(from) || !rec) { clearTimeout(this.pending.get(from)); this.pending.delete(from); this.local(to); return; }
    const fr = this.link.frame('mv', { from, to, h: rec.h ?? null });
    this.inflight.set(fr.id, { kind: 'mv', from, to });
    this.link.send(fr);
    this.files[to] = rec; delete this.files[from]; this.saveFiles();
  }
}
