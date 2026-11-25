// usage: node grab.mjs  -> shoots every skin x page; viewport + full scroll height
import { chromium } from 'playwright';
const OUT='docs/v077/critique/raw';
const skins=['collage','refined','original','plain','daylight'];
const pages=['Today','Week','Tasks','Grades','Stats'];
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:412,height:915},deviceScaleFactor:2});
await p.goto('http://localhost:8097',{waitUntil:'networkidle',timeout:180000});
await p.waitForFunction(()=>globalThis.__store?.getState().ready,null,{timeout:180000});
const modes=process.argv[2]?process.argv[2].split(','):['light'];
const sk=process.argv[3]?process.argv[3].split(','):skins;
for(const theme of modes)for(const palette of sk){
 await p.evaluate(([palette,theme])=>{const s=globalThis.__store;s.set({settings:{...s.getState().settings,onboarded:999,palette,theme}})},[palette,theme]);
 for(const r of pages){
  await p.evaluate(r=>globalThis.__store.set({route:r,sheet:null,page:null}),r);
  await p.waitForTimeout(1200);
  await p.screenshot({path:`${OUT}/${palette}-${theme}-${r}.png`});
 }
}
await b.close();
