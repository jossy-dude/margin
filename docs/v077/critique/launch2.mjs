import { chromium } from 'playwright';
const R='docs/v077/critique/raw/';
const b=await chromium.launch();
for(const pal of ['collage','daylight']){
 const ctx=await b.newContext({viewport:{width:412,height:915},deviceScaleFactor:1});
 const p=await ctx.newPage();
 await p.goto('http://localhost:8097',{waitUntil:'networkidle'});
 await p.waitForFunction(()=>globalThis.__store?.getState().ready);
 await p.evaluate((pal)=>{const s=globalThis.__store;s.set({settings:{...s.getState().settings,onboarded:999,palette:pal}}); if(s.act&&s.act.setSettings) s.act.setSettings({onboarded:999,palette:pal});},pal);
 await p.waitForTimeout(2500);
 const t0=Date.now(); const g=p.reload({waitUntil:'commit'}); await g;
 for(const m of [0,100,250,450,700,1100]){const w=m-(Date.now()-t0); if(w>0) await p.waitForTimeout(w); await p.screenshot({path:`${R}launch2-${pal}-${m}.png`}); console.log(pal,m,Date.now()-t0);}
 await ctx.close();
}
await b.close();
