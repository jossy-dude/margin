import { chromium } from 'playwright';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:412,height:915},deviceScaleFactor:2});
await p.goto('http://localhost:8097',{waitUntil:'networkidle'});
await p.waitForFunction(()=>globalThis.__store?.getState().ready);
const r=await p.evaluate(()=>{const s=globalThis.__store.getState();return {settingsKeys:Object.keys(s.settings).slice(0,80),courses:s.courses.map(c=>c.name+'|'+c.id),variants:(s.variants||[]),meetings:s.meetings.map(m=>[m.courseId,m.variantId,m.dow,m.start]).slice(0,40),teacherAbsent:s.settings.teacherAbsent, sky:s.settings.sky, now:new Date().toString()}});
console.log(JSON.stringify(r,null,1).slice(0,4000)); await b.close();
