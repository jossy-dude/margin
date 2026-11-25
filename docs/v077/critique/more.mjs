import { chromium } from 'playwright';
const R='docs/v077/critique/raw/';
const b=await chromium.launch();
async function open(palette,theme,opts={}){
 const ctx=await b.newContext({viewport:{width:412,height:915},deviceScaleFactor:2});
 const p=await ctx.newPage();
 if(opts.time) await p.clock.setFixedTime(new Date(`2026-11-25T${opts.time}:00+03:00`));
 await p.goto('http://localhost:8097',{waitUntil:'networkidle'});
 await p.waitForFunction(()=>globalThis.__store?.getState().ready);
 await p.evaluate(([palette,theme])=>{const s=globalThis.__store;s.set({settings:{...s.getState().settings,onboarded:999,palette,theme}})},[palette,theme]);
 return [ctx,p];
}
// sheets + pages
for(const [pal,th] of [['collage','light'],['daylight','light'],['refined','light'],['daylight','dark']]){
 const [ctx,p]=await open(pal,th,{time:'12:30'});
 await p.evaluate(()=>globalThis.__store.set({route:'Tasks'})); await p.waitForTimeout(800);
 for(const [name,patch] of [['task',{sheet:{t:'task'}}],['settings',{sheet:{t:'settings'}}],['add',{sheet:{t:'add'}}],['gpa',{page:{t:'gpa'}}],['notices',{page:{t:'notices'}}],['subjects',{page:{t:'subjects'}}]]){
  await p.evaluate(x=>globalThis.__store.set({sheet:null,page:null,...x}),patch); await p.waitForTimeout(1300);
  await p.screenshot({path:`${R}sheet-${pal}-${th}-${name}.png`});
  await p.evaluate(()=>globalThis.__store.set({sheet:null,page:null})); await p.waitForTimeout(500);
 }
 await ctx.close();
}
// lab mock on grades
for(const [pal,th] of [['collage','light'],['daylight','light'],['refined','light']]){
 const [ctx,p]=await open(pal,th,{time:'12:30'});
 await p.evaluate(()=>{const s=globalThis.__store,st=s.getState();
  const v=[{id:'Bl',subjectId:'B',name:'Lecture',room:'',teacher:'',note:'',ord:0,kind:'lecture',weight:60,isBase:true,attGoal:80},{id:'Bb',subjectId:'B',name:'Lab',room:'Lab-2',teacher:'',note:'',ord:1,kind:'lab',weight:40,attGoal:90}];
  const ms=st.meetings.map(m=>m.courseId==='B'&&m.start==='14:15'?{...m,variantId:'Bb'}:m);
  s.set({variants:[...(st.variants||[]),...v],meetings:ms,route:'Grades',settings:{...st.settings,teacherAbsent:{B:2,E:12,C:7,D:1}}});});
 await p.waitForTimeout(1500);
 await p.getByText('Database Systems').first().scrollIntoViewIfNeeded().catch(()=>{}); await p.waitForTimeout(600);
 await p.screenshot({path:`${R}lab-${pal}-${th}-Grades.png`});
 // number field zoom
 const f=p.locator('[data-testid^="num-teacher"]').first(); 
 await f.scrollIntoViewIfNeeded().catch(()=>{});
 const bb=await f.boundingBox();
 if(bb){const clip={x:Math.max(0,bb.x-60),y:bb.y-18,width:Math.min(412-Math.max(0,bb.x-60),bb.width+80),height:bb.height+36};
  await p.screenshot({path:`${R}nf-${pal}-${th}-1x.png`,clip});
  await p.addStyleTag({content:'[data-testid^="num-"]{font-size:31px !important}'});
  await p.waitForTimeout(300);
  const bb2=await f.boundingBox();
  await p.screenshot({path:`${R}nf-${pal}-${th}-1.3x.png`,clip:{x:Math.max(0,bb2.x-60),y:bb2.y-18,width:Math.min(412-Math.max(0,bb2.x-60),bb2.width+80),height:bb2.height+36}});
 } else console.log('no field',pal);
 await ctx.close();
}
// launch frames
{
 const ctx=await b.newContext({viewport:{width:412,height:915},deviceScaleFactor:1});
 const p=await ctx.newPage();
 await p.addInitScript(()=>{try{localStorage.setItem('x','1')}catch{}});
 const t0=Date.now(); const goto=p.goto('http://localhost:8097',{waitUntil:'commit'});
 let i=0; const marks=[0,150,400,1000,2000]; 
 await goto;
 for(const m of marks){ const w=m-(Date.now()-t0); if(w>0) await p.waitForTimeout(w); await p.screenshot({path:`${R}launch-${m}.png`}); console.log('launch',m,'actual',Date.now()-t0);}
 await ctx.close();
}
await b.close();
