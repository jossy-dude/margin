import { chromium } from 'playwright';
const R='docs/v077/critique/raw/';
const b=await chromium.launch();
for(const [pal,th] of [['collage','light'],['daylight','light']]){
 const ctx=await b.newContext({viewport:{width:412,height:915},deviceScaleFactor:2});
 const p=await ctx.newPage(); await p.clock.setFixedTime(new Date('2026-11-25T12:30:00+03:00'));
 await p.goto('http://localhost:8097',{waitUntil:'networkidle'});
 await p.waitForFunction(()=>globalThis.__store?.getState().ready);
 await p.evaluate(([pal,th])=>{const s0=globalThis.__store;s0.set({settings:{...s0.getState().settings,onboarded:999,palette:pal,theme:th}});},[pal,th]); await p.waitForTimeout(800);
 await p.evaluate(()=>{const s=globalThis.__store,st=s.getState();
  const v=[{id:'Bl',subjectId:'B',name:'Lecture',room:'',teacher:'',note:'',ord:0,kind:'lecture',weight:60,isBase:true,attGoal:80},{id:'Bb',subjectId:'B',name:'Lab',room:'Lab-2',teacher:'',note:'',ord:1,kind:'lab',weight:40,attGoal:90}];
  const ms=st.meetings.map(m=>m.courseId==='B'&&m.start==='14:15'?{...m,variantId:'Bb'}:m);
  s.set({variants:[...(st.variants||[]),...v],meetings:ms,route:'Grades',settings:{...st.settings,teacherAbsent:{B:2}}});});
 await p.waitForTimeout(1500);
 const cells=p.locator('[data-testid^="att-cell-"]'); 
 const n=await cells.count(); console.log(pal,'cells',n);
 // mark a few cells in B (last strip): tap the last 6 existing then long list
 await p.getByText("Teacher's count").last().scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
 await p.evaluate(()=>{const els=[...document.querySelectorAll('div')].filter(e=>e.textContent==="Teacher's count");const e=els[els.length-1]; const sc=e.closest('[style*="overflow"]'); });
 await p.mouse.wheel(0,-260); await p.waitForTimeout(500);
 await p.screenshot({path:`${R}lab2-${pal}-${th}.png`});
 await ctx.close();
}
await b.close();
