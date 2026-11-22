// Repeatable Lighthouse CLI measurement against the loopback-only synthetic app.
// Native DevTools observations are recorded separately; this is a simulated audit.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const [mode,label]=process.argv.slice(2);
if(!['mobile','desktop'].includes(mode)||!label||!/^[a-z0-9-]+$/.test(label))throw Error('Usage: node verification/step39/measure.mjs mobile|desktop unique-label');
const output=path.resolve('docs/evidence/step39',label);
if(fs.existsSync(output+'.report.json')||fs.existsSync(output+'.report.html'))throw Error('Choose a new label: existing evidence must not be overwritten.');
const chrome=process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const args=['verification/step39/node_modules/lighthouse/cli/index.js','http://127.0.0.1:17339/__step39/session',...(mode==='desktop'?['--preset=desktop']:[]),'--chrome-path='+chrome,'--chrome-flags=--headless=new --disable-gpu --no-first-run','--only-categories=performance,accessibility,best-practices','--output=json','--output=html','--output-path='+output,'--quiet'];
const result=spawnSync(process.execPath,args,{stdio:'inherit',timeout:120000});
if(result.error)throw result.error;process.exitCode=result.status??1;
