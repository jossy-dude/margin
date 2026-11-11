// The app's sounds are recordings, not synthesis: each one is a public-domain (CC0) clip found through
// the Openverse API (no key, no account), cut to the slot the app plays it in, and credited.
//
//   node scripts/fetch-sounds.mjs --out <dir>             -> an audition set in <dir>, with index.html
//   node scripts/fetch-sounds.mjs --apply                 -> writes into assets/sounds/ and CREDITS.md
//   node scripts/fetch-sounds.mjs --only stamp-here,tick  -> just those (with --out or --apply)
//
// A sound is only replaced when a clip passes every check (CC0, the right word in its title, long
// enough, loud enough). Anything else is left as it is and listed as "kept". Needs ffmpeg on the PATH.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.openverse.org/v1/audio/';
/* name: [seconds the app plays, search words, a word the clip's title must contain, pitch, which hit to take] */
export const SOUNDS = {
  place: [0.22, 'paper drop', /paper/i], shuffle: [0.5, 'paper shuffle', /paper|shuffl/i], crumple: [0.62, 'paper crumple', /crumpl/i],
  thud: [0.32, 'thud', /thud/i], flutter: [0.55, 'page turn', /page|paper/i], 'tape-peel': [0.66, 'tape peel', /tape/i],
  tick: [0.05, 'clock tick', /tick/i], tock: [0.05, 'clock tick', /tick/i, 0.84],
  'stamp-here': [0.22, 'rubber stamp', /stamp/i], 'stamp-late': [0.2, 'rubber stamp', /stamp/i, 1.08], 'stamp-absent': [0.36, 'rubber stamp', /stamp/i, 0.86],
  'stamp-sick': [0.3, 'rubber stamp', /stamp/i, 0.93], 'stamp-cancel': [0.25, 'rubber stamp', /stamp/i, 0.8],
  done: [0.85, 'success chime', /chime|success|bell/i], notify: [1.2, 'notification bell', /bell|notif/i], 'round-done': [0.95, 'bell ding', /bell|ding/i], 'break-start': [0.9, 'soft chime', /chime/i],
  'toggle-on': [0.06, 'switch click', /switch|click/i], 'toggle-off': [0.06, 'switch click', /switch|click/i, 0.84],
  'detent-1': [0.09, 'button click', /click/i], 'detent-2': [0.09, 'button click', /click/i, 1.06], 'detent-3': [0.09, 'button click', /click/i, 1.12], 'detent-4': [0.09, 'button click', /click/i, 1.19],
  bump: [0.18, 'soft knock', /knock|bump/i], thunk: [0.24, 'thunk', /thunk|knock/i], clack: [0.12, 'clack', /clack|clap|click/i], blip: [0.2, 'blip', /blip|beep/i], nudge: [0.2, 'pop', /pop/i],
};

/* Openverse also indexes pronunciation recordings ("LL-Q1860 (eng)-…"): a voice saying the words searched for. */
const SPEECH = /^LL-|pronunciation|speech|voice|spoken|says?\b/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-nostdin', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
/* ffmpeg prints volumedetect on stderr even on success, so run it through spawnSync-like capture. */
const measure = (file) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const peak = /max_volume: (-?[\d.]+) dB/.exec(r.stderr ?? ''), dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(r.stderr ?? '');
  return { peak: peak ? +peak[1] : -99, seconds: dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : 0 };
};

const cache = new Map();
async function search(q) {
  if (cache.has(q)) return cache.get(q);
  await sleep(3500); // anonymous use is limited to 20 requests a minute
  const res = await fetch(`${API}?q=${encodeURIComponent(q)}&license=cc0&page_size=20`, { headers: { 'User-Agent': 'sound-fetch-script' } });
  const list = res.ok ? (await res.json()).results ?? [] : [];
  cache.set(q, list);
  return list;
}

async function build(name, tmp) {
  const [secs, q, must, pitch = 1] = SOUNDS[name];
  const hits = (await search(q)).filter((h) => h.license === 'cc0' && must.test(h.title ?? '') && !SPEECH.test(h.title ?? '') && h.url && (h.duration ?? 0) >= secs * 1000 && (h.duration ?? 0) <= 12_000)
    .sort((a, b) => a.duration - b.duration);
  for (const h of hits.slice(0, 4)) {
    try {
      const raw = join(tmp, `${name}.src`), cut = join(tmp, `${name}.cut.wav`), out = join(tmp, `${name}.wav`);
      const dl = await fetch(h.url, { headers: { 'User-Agent': 'sound-fetch-script' } });
      if (!dl.ok) continue;
      writeFileSync(raw, Buffer.from(await dl.arrayBuffer()));
      const fade = Math.min(0.03, secs / 3);
      ff(['-i', raw, '-af', `silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.004,asetrate=44100*${pitch},aresample=44100,atrim=0:${secs},afade=t=out:st=${(secs - fade).toFixed(3)}:d=${fade.toFixed(3)}`, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', cut]);
      const m = measure(cut);
      if (m.seconds < secs * 0.6 || m.peak < -30) continue; // too short once the silence is gone, or nearly silent
      ff(['-i', cut, '-af', `volume=${(-2 - m.peak).toFixed(1)}dB`, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', out]);
      return { name, file: out, title: h.title, creator: h.creator ?? 'unknown', page: h.foreign_landing_url ?? h.url, licence: 'CC0 1.0', pitch };
    } catch (e) { /* try the next hit */ }
  }
  return null;
}

async function main() {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const apply = process.argv.includes('--apply'), outDir = arg('--out'), only = arg('--only')?.split(',');
  if (!apply && !outDir) { console.error('usage: node scripts/fetch-sounds.mjs (--apply | --out <dir>) [--only a,b]'); process.exit(2); }
  const dest = apply ? join(ROOT, 'assets/sounds') : outDir;
  mkdirSync(dest, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'margin-sounds-'));
  const got = [], kept = [];
  for (const name of Object.keys(SOUNDS)) {
    if (only && !only.includes(name)) continue;
    const r = await build(name, tmp);
    if (!r) { kept.push(name); console.log(`kept   ${name}`); continue; }
    writeFileSync(join(dest, `${name}.wav`), readFileSync(r.file));
    got.push(r); console.log(`new    ${name}  <- ${r.title} (${r.creator})`);
  }
  rmSync(tmp, { recursive: true, force: true });
  const credits = join(dest, 'CREDITS.md');
  const old = existsSync(credits) && only ? readFileSync(credits, 'utf8').split('\n').filter((l) => l.startsWith('| `') && !got.some((g) => l.startsWith(`| \`${g.name}\``))) : [];
  const rows = [...old, ...got.map((g) => `| \`${g.name}\` | ${g.title.replace(/\|/g, '/')} | ${g.creator} | ${g.licence} | ${g.page} |`)].sort();
  writeFileSync(credits, `# Sound credits\n\nEvery clip below is public domain (CC0 1.0), found through Openverse and cut by \`scripts/fetch-sounds.mjs\`.\nSounds not listed are older files that no clip replaced.\n\n| Sound | Clip | By | Licence | Source |\n|---|---|---|---|---|\n${rows.join('\n')}\n`);
  if (!apply) writeFileSync(join(dest, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Sounds</title><body style="font:16px sans-serif;max-width:640px;margin:24px auto">${got.map((g) => `<p><b>${g.name}</b> — ${g.title}<br><audio controls src="${g.name}.wav"></audio></p>`).join('')}</body>`);
  console.log(`\n${got.length} new, ${kept.length} kept${kept.length ? `: ${kept.join(', ')}` : ''}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
