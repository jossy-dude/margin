#!/usr/bin/env node
/* Margin v0.7 sound set: Openverse → trimmed, level-matched mono OGG files (docs/v07/SOUND.md §5).

   node scripts/sounds/build.mjs --fetch               re-read every candidate's Openverse record, refuse any licence
                                                       but CC0 / CC BY / PDM, download the file to .cache/src/
   node scripts/sounds/build.mjs --choices FILE        apply the audition page's "Copy my choices" JSON to picks.json
   node scripts/sounds/build.mjs --build               the picks → assets/sounds/v2/*.ogg + credits.json + CREDITS.md
   node scripts/sounds/build.mjs --measure             check every built file; exit 1 when one fails
   node scripts/sounds/build.mjs --audition --out DIR  every candidate → DIR/sounds/*.ogg + DIR/index.html, and
                                                       measurements.json next to this script
   node scripts/sounds/build.mjs --install             copy n_*.ogg / alarm_*.ogg into the Android res/raw folders

   Flags combine; they always run in the order above. `--all --out DIR` = fetch, build, measure, audition.
   Needs ffmpeg with libvorbis. Every edit (trim, fade, filter, level, loop) is done in dsp.mjs; ffmpeg only decodes
   to 48 kHz mono float and encodes the result. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from './dsp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SRC = path.join(HERE, '.cache', 'src');
const OUT = path.join(ROOT, 'assets', 'sounds', 'v2');
const PICKS = path.join(HERE, 'picks.json');
const MEASURE = path.join(HERE, 'measurements.json');
const RAW_APP = path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'raw');
const RAW_MOD = path.join(ROOT, 'modules', 'margin-native', 'android', 'src', 'main', 'res', 'raw');
const API = 'https://api.openverse.org/v1';
const UA = { 'User-Agent': 'openverse-client/1.0' }; // generic on purpose: no project or person in requests
const OK_LICENCES = ['cc0', 'by', 'pdm'];
const CEILING = -1.5; // dBFS sample peak before encoding; Vorbis can overshoot a little

const args = process.argv.slice(2);
const has = (f) => args.includes(f) || (args.includes('--all') && ['--fetch', '--build', '--measure', '--audition'].includes(f));
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const log = (...a) => console.log(...a);

const picks = JSON.parse(fs.readFileSync(PICKS, 'utf8'));
const groupOf = (e) => picks.groups[e.group];

// ---------- sources ----------

/** Every Openverse id a candidate uses, with where it is used. */
function sourcesOf(c) {
  if (c.mix) return c.mix;
  if (c.set) return c.set;
  return [c];
}
const allIds = () => [...new Set(picks.events.flatMap((e) => e.candidates.flatMap((c) => sourcesOf(c).map((s) => s.ov))))];

const recPath = (id) => path.join(SRC, `${id}.json`);
function record(id) {
  const p = recPath(id);
  if (!fs.existsSync(p)) throw new Error(`no record for ${id}: run --fetch first`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function audioPath(id) {
  const r = record(id);
  return path.join(SRC, `${id}.${r.filetype || path.extname(new URL(r.url).pathname).slice(1) || 'bin'}`);
}

let lastCall = 0;
async function api(url) {
  const wait = 3300 - (Date.now() - lastCall); // anonymous Openverse limit is about 20 requests a minute
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`Openverse ${res.status} for ${url}${res.status === 429 ? ' (rate limit: wait a minute)' : ''}`);
  return res.json();
}

async function fetchAll() {
  fs.mkdirSync(SRC, { recursive: true });
  const ids = allIds(), refresh = args.includes('--refresh');
  let bad = 0, manual = 0;
  for (const id of ids) {
    if (!refresh && fs.existsSync(recPath(id)) && fs.existsSync(audioPath(id))) continue;
    const r = await api(`${API}/audio/${id}/`);
    if (!OK_LICENCES.includes(r.license)) {
      log(`REFUSED ${id} "${r.title}": licence ${r.license} ${r.license_version ?? ''} cannot ship (only CC0, CC BY, PDM)`);
      bad++; continue;
    }
    fs.writeFileSync(recPath(id), JSON.stringify(r, null, 1));
    const file = audioPath(id);
    const res = await fetch(r.url, { headers: UA });
    if (res.status === 403 || res.status === 401) {
      // No retry and no disguise: the file has to come from the source page by hand.
      log(`MANUAL ${id}: ${r.provider} answered ${res.status}. Download "${r.title}" from ${r.foreign_landing_url} and save it as ${path.relative(ROOT, file)}`);
      manual++; continue;
    }
    if (!res.ok) { log(`FAILED ${id}: HTTP ${res.status} from ${r.url}`); bad++; continue; }
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    log(`fetched ${id.slice(0, 8)} ${r.license.toUpperCase()} ${r.license_version ?? ''}  "${r.title}" by ${r.creator}`);
  }
  log(`fetch: ${ids.length} sources, ${bad} refused/failed, ${manual} to download by hand`);
  if (bad) process.exitCode = 1;
}

// ---------- audio io ----------

const decoded = new Map();
function decode(file) {
  if (decoded.has(file)) return decoded.get(file);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(D.SR), '-f', 'f32le', 'pipe:1'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${r.stderr}`);
  const x = new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.length));
  decoded.set(file, x);
  return x;
}

function encode(x, file, { quality = 6, loop = false } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const meta = loop ? ['-metadata', 'ANDROID_LOOP=true'] : [];
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(D.SR), '-ac', '1', '-i', 'pipe:0',
    '-map_metadata', '-1', ...meta, '-c:a', 'libvorbis', '-q:a', String(quality), file], { input: Buffer.from(x.buffer, x.byteOffset, x.byteLength) });
  if (r.status !== 0) throw new Error(`ffmpeg could not encode ${file}: ${r.stderr}`);
}

// ---------- rendering ----------

/** Shape one source: window, filters, then (unless `asCut`, used for loops cut from a recording) onset trim, end trim
 *  and fades. */
function shape(src, p, asCut = false) {
  let x = D.slice(decode(audioPath(src.ov)), src.start ?? 0, src.dur ?? Infinity);
  if (p.hp ?? 40) x = D.pass(x, 'hp', p.hp ?? 40);
  if (p.lp) x = D.pass(x, 'lp', p.lp);
  if (asCut) return x;
  if (p.lead !== null) {
    const on = D.onsetIndex(x, p.lead ?? -40);
    x = x.slice(Math.max(0, on - Math.round((p.preroll ?? 0.002) * D.SR)));
  }
  let end = D.endIndex(x, p.tail ?? -50);
  if (p.max) end = Math.min(end, Math.round(p.max * D.SR));
  x = x.slice(0, end);
  return D.fades(x, p.fadeIn ?? 0.001, Math.min(p.fadeOut ?? 0.03, x.length / D.SR / 2));
}

/** Level to the group's target (loudest 100 ms for one-shots, integrated LUFS for alarm loops) under the peak ceiling. */
function level(x, g, p) {
  const target = (g.kind === 'alarm' ? g.lufs : g.loud) + (p.level ?? 0);
  const now = g.kind === 'alarm' ? D.loudInt(x) : D.loudMax(x);
  let d = target - now, limited = false;
  const pk = 20 * Math.log10(D.peakOf(x));
  if (pk + d > CEILING) { d = CEILING - pk; limited = true; }
  D.gain(x, d);
  return { gainDb: Math.round(d * 10) / 10, limited, target };
}

/** Render one candidate of one event into one or more takes ({suffix, x, ...}). */
function render(e, c) {
  const g = groupOf(e), p = { ...(e.shape ?? {}), ...(c.shape ?? {}) };
  if (c.set) {
    return c.set.map((s) => { const x = shape(s, { ...p, ...(s.shape ?? {}) }); return { suffix: s.suffix, x, ...level(x, g, p) }; });
  }
  let x;
  if (c.mix) {
    // A rendered pattern: each note keeps its full ring (no length cap), then the loop wraps the tails around.
    x = D.mix(c.mix.map((s) => ({ x: shape(s, { ...p, ...(s.shape ?? {}), max: null, tail: -60, fadeOut: 0.05 }), at: s.at, gain: s.gain })));
  } else {
    x = shape(c, p, Boolean(c.loop));
  }
  if (c.loop) {
    x = D.loop(x, c.loop.len, c.loop.mode ?? 'xfade', c.loop.xf ?? 1);
    if (c.loop.fadeIn) D.fades(x, c.loop.fadeIn, 0); // only for a loop that starts on a cut note
  }
  return [{ suffix: '', x, ...level(x, g, p) }];
}

const quality = (g) => picks.format.quality[g.kind] ?? 6;
const fileName = (e, suffix) => `${e.file}${suffix ? `_${suffix}` : ''}.ogg`;

function credit(e, c) {
  return sourcesOf(c).map((s) => {
    const r = record(s.ov);
    return {
      openverse_id: r.id, title: r.title, creator: r.creator, creator_url: r.creator_url,
      license: `${r.license === 'pdm' ? 'PDM' : r.license === 'cc0' ? 'CC0' : `CC ${r.license.toUpperCase()}`} ${r.license_version ?? ''}`.trim(),
      license_url: r.license_url, source: r.foreign_landing_url, provider: r.provider,
      credit_required: r.license.startsWith('by'), attribution: r.attribution,
    };
  });
}

function build() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.ogg')) fs.rmSync(path.join(OUT, f));
  const rows = [];
  for (const e of picks.events) {
    const c = e.candidates.find((k) => k.id === e.pick);
    if (!c) throw new Error(`${e.key}: pick "${e.pick}" is not one of its candidates`);
    for (const t of render(e, c)) {
      const name = fileName(e, t.suffix), g = groupOf(e);
      encode(t.x, path.join(OUT, name), { quality: quality(g), loop: g.kind === 'alarm' });
      rows.push({ file: name, event: e.key, group: e.group, candidate: c.id, gain_db: t.gainDb, peak_limited: t.limited, sources: credit(e, c) });
      log(`built ${name.padEnd(22)} ${c.id.padEnd(14)} gain ${t.gainDb >= 0 ? '+' : ''}${t.gainDb} dB${t.limited ? ' (peak-limited)' : ''}`);
    }
  }
  fs.writeFileSync(path.join(OUT, 'credits.json'), `${JSON.stringify(rows, null, 1)}\n`);
  const md = ['# Sound credits', '', 'Every sound was found through Openverse (openverse.org) and processed by `scripts/sounds/build.mjs`',
    '(trimmed, level-matched, mono 48 kHz OGG). CC0 and PDM need no credit; they are listed so the provenance stays',
    'auditable. CC BY files must keep the credit line shown here (About → Credits shows the same list).', '',
    '| File | Title | By | Licence | Source |', '|---|---|---|---|---|',
    ...rows.flatMap((r) => r.sources.map((s) => `| \`${r.file}\` | ${s.title.replace(/\|/g, '/')} | ${s.creator} | ${s.license} | ${s.source} |`))];
  fs.writeFileSync(path.join(OUT, 'CREDITS.md'), `${md.join('\n')}\n`);
  log(`build: ${rows.length} files in ${path.relative(ROOT, OUT)}`);
}

// ---------- checks ----------

function checks(e, m, t) {
  const g = groupOf(e), bad = [];
  if (m.peak < -30) bad.push(`too quiet (peak ${m.peak} dBFS)`);
  if (m.peak > -0.3) bad.push(`clips (peak ${m.peak} dBFS)`);
  if (g.kind !== 'alarm' && m.onsetMs > 30) bad.push(`starts late (${m.onsetMs} ms of silence)`);
  if (e.shape?.max && m.dur > e.shape.max + 0.02) bad.push(`too long (${m.dur} s > ${e.shape.max} s)`);
  if (g.kind === 'alarm' && m.seamDb > 3) bad.push(`loop seam jumps ${m.seamDb} dB`);
  if (t && !t.limited) {
    const got = g.kind === 'alarm' ? m.lufs : m.loud;
    if (Math.abs(got - t.target) > 1.5) bad.push(`level ${got} vs target ${t.target}`);
  }
  return bad;
}

function measureBuilt() {
  const credits = JSON.parse(fs.readFileSync(path.join(OUT, 'credits.json'), 'utf8'));
  let fail = 0;
  log('file                    dur s  peak  loud  LUFS  onset  centroid  phone%  check');
  for (const r of credits) {
    const e = picks.events.find((k) => k.key === r.event), g = groupOf(e);
    const m = D.measure(decode(path.join(OUT, r.file)), { loop: g.kind === 'alarm' });
    const target = g.kind === 'alarm' ? g.lufs : g.loud;
    const bad = checks(e, m, { limited: r.peak_limited, target: target + (({ ...(e.shape ?? {}), ...(e.candidates.find((c) => c.id === r.candidate).shape ?? {}) }).level ?? 0) });
    if (bad.length) fail++;
    log(`${r.file.padEnd(22)} ${m.dur.toFixed(2).padStart(6)} ${String(m.peak).padStart(5)} ${String(m.loud).padStart(5)} ${String(m.lufs ?? '-').padStart(5)} ${String(m.onsetMs).padStart(5)}  ${String(m.centroid).padStart(8)}  ${String(m.phone).padStart(6)}  ${bad.length ? `FAIL: ${bad.join('; ')}` : 'ok'}`);
  }
  log(`measure: ${credits.length} files, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

// ---------- audition ----------

function audition(dir) {
  const sounds = path.join(dir, 'sounds');
  fs.rmSync(sounds, { recursive: true, force: true });
  fs.mkdirSync(sounds, { recursive: true });
  const data = { built: new Date().toISOString().slice(0, 10), groups: picks.groups, events: [] }, all = {};
  for (const e of picks.events) {
    const g = groupOf(e), ev = { ...e, candidates: [] };
    for (const c of e.candidates) {
      const takes = render(e, c).map((t) => {
        const name = `${e.key}--${c.id}${t.suffix ? `_${t.suffix}` : ''}.ogg`;
        encode(t.x, path.join(sounds, name), { quality: quality(g), loop: g.kind === 'alarm' });
        const m = D.measure(decode(path.join(sounds, name)), { loop: g.kind === 'alarm' });
        return { file: `sounds/${name}`, suffix: t.suffix, gainDb: t.gainDb, limited: t.limited, m, fails: checks(e, m, t) };
      });
      const raw = sourcesOf(c).map((s) => { const r = D.measure(decode(audioPath(s.ov))); delete r.wave; return r; });
      const src = credit(e, c), rec = record(sourcesOf(c)[0].ov);
      ev.candidates.push({ ...c, takes, raw, credit: src, tags: (rec.tags ?? []).map((t) => t.name).slice(0, 10) });
      all[`${e.key}/${c.id}`] = { pick: e.pick === c.id, raw, takes: takes.map(({ file, gainDb, limited, m, fails }) => ({ file, gainDb, limited, fails, m: { ...m, wave: undefined } })) };
      log(`audition ${e.key}/${c.id}: ${takes.map((t) => `${t.m.dur}s ${t.m.loud} LUFS100 ${t.fails.length ? `FAIL ${t.fails.join('; ')}` : ''}`).join(' | ')}`);
    }
    data.events.push(ev);
  }
  const tpl = fs.readFileSync(path.join(HERE, 'audition.html'), 'utf8');
  fs.writeFileSync(path.join(dir, 'index.html'), tpl.replace('/*@DATA@*/null', JSON.stringify(data)));
  fs.writeFileSync(MEASURE, `${JSON.stringify(all, null, 1)}\n`);
  log(`audition: ${path.join(dir, 'index.html')}`);
}

// ---------- owner's choices ----------

function applyChoices(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ch = j.choices ?? j, notes = j.notes ?? {};
  let changed = 0;
  for (const [key, choice] of Object.entries(ch)) {
    const e = picks.events.find((k) => k.key === key);
    if (!e) { log(`choices: unknown event "${key}", skipped`); continue; }
    if (choice === 'none') { log(`choices: ${key} → none of these. Keep "${e.pick}" for now and find more candidates.${notes[key] ? ` Note: ${notes[key]}` : ''}`); continue; }
    if (!e.candidates.some((c) => c.id === choice)) { log(`choices: ${key} → "${choice}" is not a candidate, skipped`); continue; }
    if (e.pick !== choice) { log(`choices: ${key}: ${e.pick} → ${choice}`); e.pick = choice; changed++; }
    if (notes[key]) log(`choices: note on ${key}: ${notes[key]}`);
  }
  fs.writeFileSync(PICKS, `${JSON.stringify(picks, null, 1)}\n`);
  log(`choices: ${changed} swapped. Now run --build --measure.`);
}

function install() {
  for (const f of fs.readdirSync(OUT)) {
    const to = f.startsWith('n_') ? RAW_APP : f.startsWith('alarm_') ? RAW_MOD : null;
    if (!to || !f.endsWith('.ogg')) continue;
    fs.mkdirSync(to, { recursive: true });
    fs.copyFileSync(path.join(OUT, f), path.join(to, f));
    log(`installed ${path.relative(ROOT, path.join(to, f))}`);
  }
}

// ---------- main ----------

if (!args.length || args.includes('--help')) { log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace('#!/usr/bin/env node\n/*', '')); process.exit(0); }
if (has('--fetch')) await fetchAll();
if (val('--choices')) applyChoices(val('--choices'));
if (has('--build')) build();
if (has('--measure')) measureBuilt();
if (has('--audition')) audition(path.resolve(val('--out') ?? path.join(HERE, '.cache', 'audition')));
if (has('--install')) install();
