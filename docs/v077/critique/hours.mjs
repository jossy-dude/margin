import { chromium } from 'playwright';
const b=await chromium.launch();
const hrs={dawn:'06:30',morning:'09:30',noon:'12:30',afternoon:'15:30',dusk:'18:30',night:'23:00'};
for(const theme of ['light','dark']) for(const [k,t] of Object.entries(hrs)){
 const ctx=await b.newContext({viewport:{width:412,height:915},deviceScaleFactor:2});
 const p=await ctx.newPage();
 await p.clock.setFixedTime(new Date(`2026-11-25T${t}:00+03:00`));
 await p.goto('http://localhost:8097',{waitUntil:'networkidle'});
 await p.waitForFunction(()=>globalThis.__store?.getState().ready);
 await p.evaluate(([theme])=>{const s=globalThis.__store;s.set({settings:{...s.getState().settings,onboarded:999,palette:'daylight',theme}})},[theme]);
 for(const r of ['Today']){await p.evaluate(r=>globalThis.__store.set({route:r}),r);await p.waitForTimeout(1500);await p.screenshot({path:`docs/v077/critique/raw/hour-${theme}-${k}-${r}.png`});}
 await ctx.close();
}
await b.close();
