// v0.7.7.8 (SPEC §5): the widget picker's previews. The A51 is Android 13 and Glance's generated previews need 15, so
// each widget gets a static previewImage at its default size, drawn from the same numbers as Widgets.kt (padding,
// sizes, weights, bar) in the default skin's deck colours, at xxhdpi (3×).
//   node tools/widget-previews.mjs   → modules/margin-native/…/res/drawable-nodpi/mg_preview_{now,class}.png
//                                      docs/v077/widgets/{now,class}.png
import { chromium } from 'playwright';
import { copyFileSync, mkdirSync } from 'node:fs';

const RES = 'modules/margin-native/android/src/main/res/drawable-nodpi';
const DOCS = 'docs/v077/widgets';
mkdirSync(RES, { recursive: true }); mkdirSync(DOCS, { recursive: true });

/* Collage light's deck (the default skin), as Look.kt's defaults */
const K = { deck: '#2A241C', ink: '#FAF4E6', mut: '#D9CDB4', bar: '#FAF4E6', track: 'rgba(250,244,230,0.22)' };
const font = "font-family: Roboto, 'Noto Sans', 'DejaVu Sans', sans-serif;";
const t = (sz, c, w = 400) => `font-size:${sz}px;color:${c};font-weight:${w};line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
const chrono = (sz) => `font-size:${sz}px;color:${K.ink};font-weight:500;font-variant-numeric:tabular-nums;line-height:1;`;
const bar = (h, p) => `<div style="height:${h}px;border-radius:${h / 2}px;background:${K.track};overflow:hidden"><div style="width:${p * 100}%;height:100%;background:${K.bar}"></div></div>`;

const WIDGETS = {
  /* Now, 2×1 at its minimum (drawn at 150×64 dp, a typical 2×1; the A51's real cell size is checked on the phone): the compact layout
     (WidgetModel.nowStacked is false under 100 dp): the name, then the bar beside the countdown */
  now: {
    w: 150, h: 64, pad: 12, html: `
      <div style="${t(14, K.ink, 500)}">Database Systems</div>
      <div style="display:flex;align-items:center;gap:8px">
        <div style="flex:1">${bar(4, 0.5)}</div>
        <div style="${chrono(18)}">24:13</div>
      </div>`,
  },
  /* Class, 4×2 (250×110 dp): the name, then state and room beside the countdown, then the bar (classLayout(110)) */
  class: {
    w: 250, h: 110, pad: 14, html: `
      <div style="${t(20, K.ink, 500)}">Database Systems</div>
      <div style="display:flex;align-items:center;gap:12px">
        <div style="flex:1;min-width:0">
          <div style="${t(12, K.mut)}">Now · until 09:50</div>
          <div style="${t(14, K.mut)}">L-4 · Nkemi</div>
        </div>
        <div style="${chrono(28)}">24:13</div>
      </div>
      <div style="height:8px"></div>${bar(6, 0.5)}`,
  },
};

const b = await chromium.launch();
for (const [name, w] of Object.entries(WIDGETS)) {
  const p = await b.newPage({ viewport: { width: w.w, height: w.h }, deviceScaleFactor: 3 });
  await p.setContent(`<html><body style="margin:0;background:transparent;${font}">
    <div style="box-sizing:border-box;width:${w.w}px;height:${w.h}px;padding:${w.pad}px;border-radius:22px;background:${K.deck};display:flex;flex-direction:column;justify-content:center">${w.html}</div>
  </body></html>`);
  const out = `${RES}/mg_preview_${name}.png`;
  await p.screenshot({ path: out, omitBackground: true });
  copyFileSync(out, `${DOCS}/${name}.png`);
  console.log(out);
}
await b.close();
