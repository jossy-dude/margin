# Focus (timer) page redesign — shared brief for three parallel agents

**Make v1 first.** One shippable slice: one self-contained HTML file that shows the redesigned
timer screen. No framework, no build step, no changes to the app's source code.

## What the screen is

The app is an Expo/React Native school planner with a hand-drawn paper aesthetic. The timer screen
is `src/screens/Focus.tsx` (~460 lines). **Read it first** — its comments document every decision
and tell you what the components do.

Current shipped look (photos of the live app):

- `.shots/w3/w3-default-set.png` — the "ready" state
- `.shots/w3/w3-default-running.png` — the "running" state
- `.shots/ux-audit/50-focus-open.png`, `53-focus-running.png` — earlier state

**Open these images and look at them.** That is the current design.

## The task

Redesign the timer page. Two hard constraints:

1. **No background image.** The app's whole page background is one baked photo
   (`assets/images/journal-page.jpg`: torn paper, a Venice canal photo, pressed flowers, a
   landscape at the bottom). You may **not** reference any image. The background must be
   *designed* — CSS gradients, SVG, noise, linework, type, whatever earns its place. It must not
   look like an empty rectangle where a photo used to be. It must not look like a stock AI gradient
   either.
2. **Keep the UI components.** Keep every control the screen has and its current job:
   - round badge (`Round 1 · ready`) + the four round dots
   - settings (gear), back (chevron), sound toggle — top-right
   - task card: course name + task title + `swap task`
   - the dial (draggable in the real app) with the pointer hand, progress rim, guilloché/rosette artwork
   - the time readout (a taped paper slip under the dial in the shipped version; `focus-time`)
   - the status line under it (`25m to go`, `ready when you are`, …)
   - presets 25 / 45 / 50 / 90 and the `Flow` toggle
   - primary `Start` / `Pause` button
   - `break · 5m` and `end session` / `leave`
   - the handwritten aside `focus doesn't happen by accident`
   Keep them recognisable as the same screen. Restyle, reposition, resize — but do not delete or
   invent functionality. Do not add features the screen does not have (no charts, no stats, no
   settings panels).

Everything else is yours: background, layout, rhythm, hierarchy, colour, type scale, states.

## Deliverable

One file: `design/<your-name>.html` where `<your-name>` is one of `deepseek`, `mimo`, `glm`
(example: `design/deepseek.html`). Self-contained apart from fonts — see below.

It must:

- render the **phone screen as its own canvas at 440 × 1001 CSS px** (the app's own design units,
  see `Focus.tsx` line 252), scaled to fit the browser and centred on a dark desk backdrop, with a
  phone-style rounded frame. Everything inside the screen is positioned in canvas units.
- show the **ready state** by default, and let a reviewer switch to **running** (a live countdown),
  **last 10 seconds** (the app draws a red pen border round the readout) and **round done** (the red
  rubber stamp) — those preview controls live **outside** the phone frame, on the desk, clearly
  labelled as review controls. They are not part of the design.
- include `title` and `meta description`, semantic landmarks, visible `:focus-visible` rings,
  `prefers-reduced-motion` handling, and `:active` press feedback on every button
  (the app dips a button by 3 % on press — `src/ui/kit.tsx` `Btn`).
- work offline. **There is no internet on this machine** (curl to Google Fonts times out), so do not
  `@import` remote fonts.

### Fonts (local, already in the repo)

Use the app's own faces via relative `@font-face` (the file lives in `design/`):

| role | family in the app | file |
|---|---|---|
| hand / labels | `Caveat_500Medium`, `Caveat_700Bold` | `../node_modules/@expo-google-fonts/caveat/{500Medium,700Bold}/*.ttf` |
| serif italic (course, status line) | `Newsreader_400Regular_Italic`, `Newsreader_600SemiBold_Italic` | `../node_modules/@expo-google-fonts/newsreader/{400Regular_Italic,600SemiBold_Italic}/*.ttf` |
| marker (task title) | `PermanentMarker_400Regular` | `../node_modules/@expo-google-fonts/permanent-marker/400Regular/*.ttf` |
| typewriter (the countdown) | `SpecialElite_400Regular` | `../node_modules/@expo-google-fonts/special-elite/400Regular/*.ttf` |

If you want a different typeface for the redesign you may only use fonts that already exist under
`node_modules` (look: `ls node_modules/@expo-google-fonts`). Keep the countdown in a face with
tabular figures or use `font-variant-numeric: tabular-nums`.

### Colour

`src/tokens/theme.ts` is the single source of colour truth. Default palette is `refined.light`:
paper `#FAF4E6`, card `#FFFBF1`, ink `#2A241C`, mut `#665B4B`, acc `#8A4B27`, hl `#F3E3A8`,
bad `#9C3322`, desk `#E9DFC9`. One accent only; desaturate anything you add. Light theme only for
v1 (state that dark is excluded).

### Icon paths (copy these exactly — `src/ui/kit.tsx` `ICONS`, 24×24, stroke 1.8, round caps)

```
gear    M12 9a3 3 0 100 6 3 3 0 000-6zM12 4.7a7.3 7.3 0 100 14.6 7.3 7.3 0 000-14.6zM12 4.7V1.9M17.1 6.9L19.1 4.9M19.3 12h2.8M17.1 17.1l2 2M12 19.3v2.8M6.9 17.1l-2 2M4.7 12H1.9M6.9 6.9L4.9 4.9
back    M15 5l-7 7 7 7
play    M7 4l13 8-13 8z
pause   M7 4h3.5v16H7zM13.5 4H17v16h-3.5z
coffee  M4 9h12v6a4 4 0 01-4 4H8a4 4 0 01-4-4zM16 10h2a2 2 0 010 4h-2M7 3c0 2 2 2 2 4M11 3c0 2 2 2 2 4
sound   M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 010 7
```

### The hand-cut outline (the app's signature component)

Every box on this screen is cut by hand, not rounded: `src/ui/hand.ts` `handPath(w, h, corners, seed, amp)`
walks the rounded-rect perimeter with elliptical corners and adds low-frequency wobble. Port it to
JS (~25 lines) and inject an SVG behind each box the way `HandBox` does (`src/ui/kit.tsx` line 105):
a shadow path offset (2.4, 2.8) at 16 % ink, then the fill + `ink` stroke on top. Corners come from
`RG` in `src/tokens/theme.ts` (`h: [255,14,225,14]`, `v: [14,225,14,255]`, CSS-style elliptical,
scaled when they exceed the side). Tape = a 20-unit tall bar, fill `#E7D9AE99`, edge `#B8A56E55`,
`rotate(-12deg)`, overlapping the paper's edge. Do not replace this vocabulary with `border-radius`
— it is the app's identity.

## Working method

1. **Load skills before you write anything.** Use the `skill` tool. Load at least
   `impeccable` (required — read it fully), then pick two of `redesign-existing-projects`,
   `design-taste-frontend`, `gpt-taste`, `ui-ux-pro-max`, `frontend-design`, `make-interfaces-feel-better`,
   `web-design-guidelines`. Follow them; they define the craft floor.
2. **Read** `src/screens/Focus.tsx`, `src/tokens/theme.ts`, `src/ui/hand.ts`, the two
   `.shots/w3/*.png` screenshots, and the current `design/` folder (another agent may have finished
   a sibling file — ignore theirs).
3. **Diagnose** the current page in 5-10 bullets before you draw (the audit section of
   `redesign-existing-projects` is the checklist). Write your diagnosis as an HTML comment at the
   top of your file: what you changed and why. A reviewer must be able to judge intent.
4. **Build it, then look at it.** Screenshot your own file with Playwright and actually view the
   PNG before you claim it is done:

   ```bash
   cd /home/jossy/Documents/Projects/School_planner_v2
   node -e "
   const {chromium}=require('playwright');
   (async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:560,height:1100},deviceScaleFactor:1});
   await p.goto('file:///home/jossy/Documents/Projects/School_planner_v2/design/<your-name>.html');
   await p.waitForTimeout(900); await p.screenshot({path:'/tmp/opencode/<your-name>.png',fullPage:true}); await b.close();})();
   "
   ```

   Then **read the PNG** (the `read` tool renders images) and fix what is wrong. Iterate at least
   twice. If you only look at your code, you have not done the job.
5. Report: file path, your diagnosis summary, what you changed and why, what you excluded.

## Out of scope for v1

Dark theme, the break sticker, real timer logic against the store, keyboard/drag gestures beyond a
demonstrated press, accessibility audit beyond roles/labels on the buttons you draw, and any change
to the app's source files.
