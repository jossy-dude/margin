import { chromium } from 'playwright';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:412,height:915}});
const p=await ctx.newPage(); await p.clock.setFixedTime(new Date('2026-11-25T12:30:00+03:00'));
await p.goto('http://localhost:8097',{waitUntil:'networkidle'});
await p.waitForFunction(()=>globalThis.__store?.getState().ready);
await p.evaluate(()=>{const s=globalThis.__store;s.set({settings:{...s.getState().settings,onboarded:999,palette:'daylight',theme:'light'}})});
for(const r of ['Today','Week','Tasks','Grades','Stats']){
 await p.evaluate(r=>globalThis.__store.set({route:r}),r); await p.waitForTimeout(1200);
 const res=await p.evaluate(()=>{
  const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};
  const els=[...document.querySelectorAll('[role=button],[role=tab],[role=checkbox],[role=switch],button,a,[tabindex="0"],input')].filter(vis);
  const small=els.map(e=>{const r=e.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),n:(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,28)}}).filter(x=>x.h<44||x.w<44);
  const noname=els.filter(e=>!(e.getAttribute('aria-label')||e.textContent||'').trim()).length;
  const clipped=[...document.querySelectorAll('div,span')].filter(e=>vis(e)&&e.children.length===0&&e.textContent.trim()&&e.scrollWidth>e.clientWidth+2).map(e=>e.textContent.trim().slice(0,30));
  return {total:els.length,small:small.length,smallEx:small.slice(0,14),noname,clipped:[...new Set(clipped)].slice(0,12)}});
 console.log(r,JSON.stringify(res));
}
await b.close();
