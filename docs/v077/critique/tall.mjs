import { chromium } from 'playwright';
const R='docs/v077/critique/raw/';
const b=await chromium.launch();
for(const [pal,th,page] of [['collage','light','Today'],['daylight','light','Today'],['plain','light','Today']]){
 const ctx=await b.newContext({viewport:{width:412,height:2000},deviceScaleFactor:1.5});
 const p=await ctx.newPage(); await p.clock.setFixedTime(new Date('2026-11-25T12:30:00+03:00'));
 await p.goto('http://localhost:8097',{waitUntil:'networkidle'});
 await p.waitForFunction(()=>globalThis.__store?.getState().ready);
 await p.evaluate(([pal,th])=>{const s=globalThis.__store;s.set({settings:{...s.getState().settings,onboarded:999,palette:pal,theme:th}});},[pal,th]);
 await p.evaluate(r=>globalThis.__store.set({route:r}),page); await p.waitForTimeout(2000);
 await p.screenshot({path:`${R}tall-${pal}-${th}-${page}.png`});
 await ctx.close();
}
await b.close();
