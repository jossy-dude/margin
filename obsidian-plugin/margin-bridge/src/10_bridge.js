/*
 * Margin Bridge — the Obsidian half of docs/BRIDGE.md (format `margin-bridge/1`).
 *
 *   <vault>/.margin/margin.json     written only by Margin, read here
 *   <vault>/.margin/obsidian.json   written only here, read by Margin
 *
 * One writer per file, so git (Obsidian Git on the desktop, GitSync on the phone) never has to merge
 * inside one. For the same reason the bridge runs on ONE device: by default the phone, where Margin
 * lives (Settings → "Run the bridge on this device", kept per device, not synced). The desktop sees
 * the results — Margin/Tasks.md, Margin/Timetable.md, the task lines — when git brings them over. Tasks made in Margin become lines in one note; task lines in the vault that carry the
 * school tag and a due date go to Margin. Task lines use the Bone Tasks grammar, so both plugins read
 * the same line. Plain JavaScript; `node build.mjs` joins src/ (with vault-sync's sync-core) into main.js.
 */
const obsidian = require('obsidian');

const FORMAT = 'margin-bridge/1', DIR = '.margin', IN = `${DIR}/margin.json`, OUT = `${DIR}/obsidian.json`;
const DEFAULTS = { tasksNote: 'Margin/Tasks.md', timetableNote: 'Margin/Timetable.md', tag: '#school', seen: {}, sent: {}, lastSync: 0 };
const TOMBSTONE_DAYS = 30;

/* ── the task line, both directions (the same grammar as src/domain/bridge.ts) ─────────────── */
const PRIO_EMOJI = { 5: '🔺', 4: '⏫', 3: '🔼', 2: '🔽', 1: '⏬' };
const PRIO_OF = { '🔺': 5, '⏫': 4, '🔼': 3, '🔽': 2, '⏬': 1 };
const TASK_RE = /^(\s*(?:>\s*)*)([-*+]|\d+[.)])\s+\[(.)\]\s+(.*)$/;
const FIELD_STRIP = /(?:[📅⏳🛫✅➕❌]\s*\d{4}-\d{2}-\d{2})|(?:[🔺⏫🔼🔽⏬])|(?:🔁\s*[^📅⏳🛫✅➕❌⏰⏱🔺⏫🔼🔽⏬]*)|(?:⏰\s*\d{1,2}:\d{2})|(?:⏱\s*\d+m)|(?:[🆔⛔]\s*\S+)/gu;
const ID_RE = /\s\^([\w-]+)\s*$/;
const TAG_RE = /(^|\s)#([\p{L}\p{N}_/-]+)/gu;
const blockId = (id) => String(id).replace(/[^\w-]/g, '-');
const clock = (t) => { const [h, m] = t.split(':'); return `${h.padStart(2, '0')}:${m}`; };

function taskLine(id, t) {
  const parts = [`- [${t.done ? 'x' : ' '}] ${String(t.title).replace(/\s+/g, ' ').trim()}`];
  if (t.course) parts.push(`#${t.course.replace(/\s+/g, '-')}`);
  if (PRIO_EMOJI[t.prio]) parts.push(PRIO_EMOJI[t.prio]);
  if (t.start) parts.push(`🛫 ${t.start}`);
  if (t.due) parts.push(`📅 ${t.due}`);
  if (t.time) parts.push(`⏰ ${t.time}`);
  if (t.spentMin > 0) parts.push(`⏱ ${Math.round(t.spentMin)}m`);
  if (t.done && t.doneOn) parts.push(`✅ ${t.doneOn}`);
  parts.push(`^${blockId(id)}`);
  return parts.join(' ');
}

/** A task line as a bridge task, or null when the line is not a task. `scopeTag` is left out of the subject. */
function parseTaskLine(line, path = null, scopeTag = '') {
  const m = TASK_RE.exec(line);
  if (!m) return null;
  const body = m[4], status = m[3];
  const get = (e) => (new RegExp(`${e}\\s*(\\d{4}-\\d{2}-\\d{2})`, 'u').exec(body) || [])[1] || null;
  const time = (/⏰\s*(\d{1,2}:\d{2})/u.exec(body) || [])[1] || null, spent = (/⏱\s*(\d+)m/u.exec(body) || [])[1];
  const prio = (body.match(/[🔺⏫🔼🔽⏬]/u) || [])[0], id = (ID_RE.exec(body) || [])[1] || null;
  const tags = [...body.matchAll(TAG_RE)].map((x) => x[2]), scope = scopeTag.replace(/^#/, '').toLowerCase();
  const subject = tags.find((t) => t.toLowerCase() !== scope) || null;
  const title = body.replace(FIELD_STRIP, '').replace(ID_RE, '').replace(TAG_RE, '$1').replace(/\s{2,}/g, ' ').trim();
  return {
    title, blockId: id, status, tags, done: status === 'x' || status === 'X', doneOn: get('✅'), due: get('📅') || get('⏳'), time: time ? clock(time) : null, start: get('🛫'),
    prio: prio ? PRIO_OF[prio] || 0 : 0, estimateMin: null, spentMin: spent ? +spent : 0, course: subject ? subject.replace(/-/g, ' ') : null, kind: null, notes: '', path, steps: [],
  };
}

/** The bridge fields of a parsed line, without the bookkeeping this file adds. */
const dataOf = (p) => ({ title: p.title, done: p.done, doneOn: p.doneOn, due: p.due, time: p.time, start: p.start, prio: p.prio, estimateMin: p.estimateMin, spentMin: p.spentMin, course: p.course, kind: p.kind, notes: p.notes, path: p.path, steps: p.steps });

function parseEnvelope(text) {
  try {
    const e = JSON.parse(text);
    if (!e || e.format !== FORMAT || !Array.isArray(e.tasks)) return null;
    return { ...e, events: Array.isArray(e.events) ? e.events : [], sessions: Array.isArray(e.sessions) ? e.sessions : [] };
  } catch (err) { return null; }
}

/* ── Margin → the tasks note ───────────────────────────────────────────────────────────────── */
/**
 * Writes Margin's own tasks into the note's text. A row is applied once: `seen[blockId]` remembers the
 * stamp it carried, and `sent[blockId]` the line as written, so an untouched line is never sent back
 * to Margin as if Obsidian had changed it.
 */
function applyMargin(text, env, state) {
  const lines = text.length ? text.split('\n') : [];
  let changed = false;
  for (const item of env.tasks) {
    if (item.origin !== 'margin') continue;
    const id = blockId(item.id), was = state.seen[id];
    if (was && item.updatedAt <= was.at) continue;
    const at = lines.findIndex((l) => (ID_RE.exec(l) || [])[1] === id);
    if (item.deleted || !item.data) {
      if (at >= 0) { lines.splice(at, 1); changed = true; }
      delete state.sent[id];
    } else {
      const line = taskLine(item.id, item.data);
      if (at >= 0) { if (lines[at] !== line) { lines[at] = line; changed = true; } } else { lines.push(line); changed = true; }
      state.sent[id] = { hash: line, updatedAt: item.updatedAt, origin: 'margin', id: item.id };
    }
    state.seen[id] = { at: item.updatedAt, id: item.id };
  }
  return { text: lines.join('\n'), changed };
}

/** A change Margin made to a task that lives in a note (ticked, re-dated): only the checkbox and the dates move. */
function patchLine(line, d) {
  const p = parseTaskLine(line);
  if (!p) return line;
  let out = line.replace(/\[(.)\]/, `[${d.done ? 'x' : ' '}]`);
  out = out.replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/u, '');
  if (d.due && p.due && d.due !== p.due) out = out.replace(/(📅\s*)\d{4}-\d{2}-\d{2}/u, `$1${d.due}`);
  if (d.done && d.doneOn) out = out.replace(ID_RE, ` ✅ ${d.doneOn} ^${p.blockId}`);
  return out;
}

/* ── the vault's task lines → obsidian.json ────────────────────────────────────────────────── */
const newId = () => `m${Math.random().toString(36).slice(2, 8)}`;

/**
 * One file's lines as bridge rows. A line is taken when it already has a block id this bridge knows,
 * or when it is in scope (the tasks note, or the school tag), still open and has a due date; such a
 * line is given a block id. Returns the rows and the text, changed only if an id was added.
 */
function collectFile(text, path, mtime, state, opts) {
  const lines = text.split('\n'), rows = [];
  let changed = false;
  const scope = opts.tag.replace(/^#/, '').toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    const p = parseTaskLine(lines[i], path, opts.tag);
    if (!p) continue;
    let id = p.blockId;
    const known = id && (state.sent[id] || state.seen[id]);
    const inScope = path === opts.tasksNote || (scope && p.tags.some((t) => t.toLowerCase() === scope));
    if (!known && !(inScope && !p.done && p.due)) continue;
    if (!id) { id = (opts.makeId || newId)(); lines[i] = `${lines[i].replace(/\s+$/, '')} ^${id}`; changed = true; }
    const prev = state.sent[id], origin = state.seen[id] ? 'margin' : 'obsidian';
    /* A Margin task whose line nobody touched goes back unsent: Margin already has it, and has more of it. */
    if (origin === 'margin' && prev && prev.hash === lines[i]) continue;
    const updatedAt = prev && prev.hash === lines[i] ? prev.updatedAt : mtime;
    state.sent[id] = { hash: lines[i], updatedAt, origin, id: origin === 'margin' ? state.seen[id].id : id, path };
    rows.push({ id: state.sent[id].id, origin, updatedAt, data: dataOf(p) });
  }
  return { rows, text: lines.join('\n'), changed };
}

/** Rows for lines that were sent before and are gone now, kept for a month so Margin hears about it. */
function tombstones(state, live, now) {
  const out = [];
  for (const [bid, s] of Object.entries(state.sent)) {
    if (s.origin !== 'obsidian') continue;
    if (s.deleted) { if (now - s.updatedAt > TOMBSTONE_DAYS * 86_400_000) delete state.sent[bid]; else out.push({ id: s.id, origin: 'obsidian', updatedAt: s.updatedAt, deleted: true }); continue; }
    if (!live.has(bid)) { state.sent[bid] = { ...s, deleted: true, updatedAt: now }; out.push({ id: s.id, origin: 'obsidian', updatedAt: now, deleted: true }); }
  }
  return out;
}

/** What goes in obsidian.json. Sorted, so two devices reading the same notes write the same bytes. */
function buildOut(rows, now) {
  const tasks = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { format: FORMAT, app: 'bone', writtenAt: now, tasks, events: [], sessions: [] };
}
const sameOut = (a, b) => JSON.stringify({ ...a, writtenAt: 0 }) === JSON.stringify({ ...b, writtenAt: 0 });

/* ── the timetable note ────────────────────────────────────────────────────────────────────── */
const two = (n) => String(n).padStart(2, '0');
const hm = (ms) => { const d = new Date(ms); return `${two(d.getHours())}:${two(d.getMinutes())}`; };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function timetableNote(env) {
  const events = env.events.filter((e) => e.data && !e.deleted).map((e) => e.data).sort((a, b) => a.at - b.at);
  const out = ['---', 'margin: timetable', '---', '', '> Written by Margin Bridge. Edits here are overwritten; change classes in Margin.', ''];
  let day = '';
  for (const e of events) {
    const d = new Date(e.at), key = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
    if (key !== day) { if (day) out.push(''); out.push(`## ${DAYS[d.getDay()]} ${key}`); day = key; }
    const text = `${hm(e.at)}${e.end ? `–${hm(e.end)}` : ''} ${e.title}${e.room ? ` · ${e.room}` : ''}`;
    out.push(`- ${e.cancelled ? `~~${text}~~ cancelled` : text}`);
  }
  if (!events.length) out.push('No classes in the next two weeks.');
  return `${out.join('\n')}\n`;
}

/* ── the plugin ────────────────────────────────────────────────────────────────────────────── */
class MarginBridge extends obsidian.Plugin {
  async onload() {
    this.state = Object.assign({}, DEFAULTS, await this.loadData());
    this.state.seen = this.state.seen || {}; this.state.sent = this.state.sent || {};
    this.savedAs = this.stateText();
    this.files = new Map(); // path -> { mtime, rows }: a file is parsed again only when it changes
    this.busy = false;
    this.status = this.addStatusBarItem();
    this.addSettingTab(new MarginSettings(this.app, this));
    this.addCommand({ id: 'sync-now', name: 'Sync with Margin now', callback: () => this.sync(true) });
    const soon = obsidian.debounce(() => this.sync(false), 1500, true);
    this.registerEvent(this.app.vault.on('modify', soon));
    this.registerEvent(this.app.vault.on('delete', soon));
    this.registerDomEvent(document, 'visibilitychange', () => { if (!document.hidden) this.sync(false); });
    /* v0.7: no 30 s polling any more (battery; vault-sync PLAN found issue 13). The bridge runs on file
       changes and when Obsidian comes to the front; live sync carries the files themselves. */
    this.app.workspace.onLayoutReady(() => this.sync(false));
    this.live = new LiveSync(this);
    this.live.start();
  }
  onunload() { this.live?.stop(); }
  liveChanged(state, note) {
    this.liveState = state;
    if (note) new obsidian.Notice(`Margin: ${note}`);
    this.renderStatus?.();
  }

  /** Whether this device runs the bridge: a per-device choice (local storage), the phone by default. */
  runsHere() { const v = this.app.loadLocalStorage?.('margin-bridge-run'); return v == null ? !!obsidian.Platform.isMobile : v === 'true'; }
  setRunsHere(on) { this.app.saveLocalStorage?.('margin-bridge-run', on ? 'true' : 'false'); }
  /** The part of the state worth a write to data.json; lastSync changes every 30 s and is kept in memory. */
  stateText() { const { lastSync, ...rest } = this.state; return JSON.stringify(rest); }
  async saveState() { const t = this.stateText(); if (t !== this.savedAs) { await this.saveData(this.state); this.savedAs = t; } }

  async readNote(path) { const f = this.app.vault.getAbstractFileByPath(path); return f instanceof obsidian.TFile ? this.app.vault.read(f) : null; }
  async writeNote(path, text) {
    const f = this.app.vault.getAbstractFileByPath(path);
    if (f instanceof obsidian.TFile) { await this.app.vault.modify(f, text); return; }
    const dir = path.split('/').slice(0, -1).join('/');
    if (dir && !this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir).catch(() => {});
    await this.app.vault.create(path, text);
  }

  async sync(loud) {
    if (this.busy) return;
    if (!this.runsHere()) {
      this.status.setText('Margin: synced on the phone');
      if (loud) new obsidian.Notice('Margin Bridge runs on the phone, where Margin is. Turn on "Run the bridge on this device" in its settings to run it here instead.');
      return;
    }
    this.busy = true;
    try {
      const ad = this.app.vault.adapter, now = Date.now(), s = this.state;
      const env = (await ad.exists(IN)) ? parseEnvelope(await ad.read(IN)) : null;
      if (env) {
        /* Margin's tasks into the tasks note. */
        const before = (await this.readNote(s.tasksNote)) ?? '';
        const res = applyMargin(before, env, s);
        if (res.changed) await this.writeNote(s.tasksNote, res.text);
        /* Margin's changes to tasks that live in notes. */
        for (const item of env.tasks) {
          if (item.origin !== 'obsidian' || item.deleted || !item.data) continue;
          const sent = s.sent[blockId(item.id)];
          if (!sent || sent.deleted || item.updatedAt <= sent.updatedAt || !sent.path) continue;
          const text = await this.readNote(sent.path);
          if (text == null) continue;
          const lines = text.split('\n'), at = lines.findIndex((l) => (ID_RE.exec(l) || [])[1] === blockId(item.id));
          if (at < 0) continue;
          const next = patchLine(lines[at], item.data);
          if (next !== lines[at]) { lines[at] = next; await this.writeNote(sent.path, lines.join('\n')); }
          s.sent[blockId(item.id)] = { ...sent, hash: next, updatedAt: item.updatedAt };
        }
        /* The timetable, rewritten whole when it differs. */
        const table = timetableNote(env);
        if ((await this.readNote(s.timetableNote)) !== table) await this.writeNote(s.timetableNote, table);
      }
      /* The vault's task lines out. */
      const rows = [], live = new Set(), opts = { tag: s.tag || '', tasksNote: s.tasksNote };
      for (const f of this.app.vault.getMarkdownFiles()) {
        const cache = this.app.metadataCache.getFileCache(f);
        if (!cache || !cache.listItems || !cache.listItems.some((li) => li.task !== undefined)) { this.files.delete(f.path); continue; }
        let got = this.files.get(f.path);
        if (!got || got.mtime !== f.stat.mtime) {
          const text = await this.app.vault.cachedRead(f), res = collectFile(text, f.path, f.stat.mtime, s, opts);
          if (res.changed) await this.app.vault.modify(f, res.text);
          got = { mtime: res.changed ? -1 : f.stat.mtime, rows: res.rows, ids: res.text.split('\n').map((l) => (ID_RE.exec(l) || [])[1]).filter(Boolean) };
          this.files.set(f.path, got);
        }
        for (const r of got.rows) rows.push(r);
        for (const id of got.ids) live.add(id);
      }
      const out = buildOut([...rows, ...tombstones(s, live, now)], now);
      const prev = (await ad.exists(OUT)) ? parseEnvelope(await ad.read(OUT)) : null;
      if (!prev || !sameOut(prev, out)) {
        if (!(await ad.exists(DIR))) await ad.mkdir(DIR);
        await ad.write(OUT, `${JSON.stringify(out, null, 1)}\n`);
      }
      s.lastSync = now;
      await this.saveState();
      this.status.setText(env ? `Margin ✓ ${hm(now)}` : 'Margin: waiting for the app');
      if (loud) new obsidian.Notice(env ? `Margin: ${out.tasks.length} task(s) sent, ${env.tasks.length} read.` : 'Margin: no .margin/margin.json yet. Connect the vault in Margin → Settings → Obsidian.');
    } catch (e) {
      console.error('Margin Bridge', e);
      this.status.setText('Margin: sync problem');
      if (loud) new obsidian.Notice(`Margin: ${e && e.message ? e.message : e}`);
    } finally { this.busy = false; }
  }
}

class MarginSettings extends obsidian.PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl: el } = this, s = this.plugin.state;
    el.empty();
    const field = (name, desc, key) => new obsidian.Setting(el).setName(name).setDesc(desc).addText((t) => t.setValue(s[key]).onChange(async (v) => { s[key] = v.trim(); this.plugin.files.clear(); await this.plugin.saveData(s); }));
    field('Tasks note', 'Tasks made in Margin are written here.', 'tasksNote');
    field('Timetable note', 'The next two weeks of classes, rewritten by the bridge.', 'timetableNote');
    field('School tag', 'Open tasks with this tag and a due date are sent to Margin. Empty: only the tasks note.', 'tag');
    new obsidian.Setting(el).setName('Run the bridge on this device').setDesc('On for the phone, where Margin lives. Keep it on for one device only: two devices writing the same files give git conflicts. Not synced.').addToggle((t) => t.setValue(this.plugin.runsHere()).onChange((v) => { this.plugin.setRunsHere(v); this.plugin.sync(true); this.display(); }));
    const live = this.plugin.live;
    new obsidian.Setting(el).setHeading().setName('Live sync with your desktop');
    new obsidian.Setting(el).setName('Connect to Margin')
      .setDesc(live.enabled ? `Status: ${live.state}${live.peers ? ` · ${live.peers.map((p) => p.name || p.role).join(', ')}` : ''}. Edits reach your desktop through Margin while Obsidian is open.`
        : 'Get a 6-digit code in Margin → Settings → Sync → "Connect phone Obsidian", then type it here. Per device, not synced.')
      .addText((t) => { t.setPlaceholder('6-digit code'); t.inputEl.inputMode = 'numeric'; this.code = t; })
      .addButton((b) => b.setButtonText(live.enabled ? 'Reconnect' : 'Connect').onClick(async () => {
        try { await live.pairWithCode(this.code.getValue()); new obsidian.Notice('Margin: connecting…'); } catch (e) { new obsidian.Notice(`Margin: ${e.message}`); }
        this.display();
      }));
    if (live.enabled) new obsidian.Setting(el).setName('Turn live sync off on this device').addButton((b) => b.setButtonText('Turn off').onClick(() => { live.forget(); this.display(); }));
    new obsidian.Setting(el).setName('Sync now').setDesc(s.lastSync ? `Last sync ${new Date(s.lastSync).toLocaleString()}` : 'Not synced yet').addButton((b) => b.setButtonText('Sync').onClick(() => this.plugin.sync(true)));
  }
}

