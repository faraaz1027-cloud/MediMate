import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
const dir='docs/evidence/step39';
const files=fs.readdirSync(dir).filter(n=>n.endsWith('.report.json')||n==='desktop-repeat.json');
const runs=files.map(file=>{
 const r=JSON.parse(fs.readFileSync(dir+'/'+file));
 const network=r.audits['network-requests'].details.items;
 return {file,at:r.fetchTime,lighthouse:r.lighthouseVersion,environment:r.environment,config:r.configSettings,url:r.finalDisplayedUrl,warnings:r.runWarnings,scores:Object.fromEntries(Object.entries(r.categories).map(([k,v])=>[k,v.score*100])),metrics:Object.fromEntries(['first-contentful-paint','largest-contentful-paint','cumulative-layout-shift','total-blocking-time','speed-index'].map(k=>[k,{value:r.audits[k].numericValue,unit:r.audits[k].numericUnit}])),requests:network.length,transferBytes:network.reduce((n,i)=>n+(i.transferSize||0),0),network:network.map(i=>({url:i.url,status:i.statusCode,type:i.resourceType,transferBytes:i.transferSize,startMs:i.networkRequestTime,endMs:i.networkEndTime,durationMs:i.networkEndTime-i.networkRequestTime})),consoleErrors:r.audits['errors-in-console'].details?.items||[]};
});
fs.writeFileSync(dir+'/measurements.json',JSON.stringify({recordedAt:new Date().toISOString(),synthetic:true,host:{platform:os.platform(),release:os.release(),cpu:os.cpus()[0]?.model.trim(),logicalCpus:os.cpus().length,totalGiB:Math.round(os.totalmem()/2**30)},limitations:['Loopback origin, disposable replica database and controlled providers.','CLI Lighthouse uses simulated throttling and an isolated headless profile.','Bootstrap session redirect is measurement-only and contributes to these timings.','Native Chrome uses the existing profile/extensions; counts include extension requests.','Single-run measurements with one diagnostic desktop repeat; no field-percentile claim.'],runs},null,2)+'\n');
const artifacts=fs.readdirSync(dir).filter(n=>n!=='manifest.json').map(name=>({name,bytes:fs.statSync(dir+'/'+name).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(dir+'/'+name)).digest('hex')}));
const sourceNames=['client/src/App.jsx','client/src/index.css','client/index.html','client/public/favicon.svg','verification/step39/server.mjs','verification/step39/measure.mjs','verification/step39/record.mjs','verification/step39/package-review.py','docs/STEP_39_BROWSER_PERFORMANCE.md','client/dist/index.html',...fs.readdirSync('client/dist/assets').map(n=>'client/dist/assets/'+n)];
const sources=sourceNames.map(name=>({name,sha256:crypto.createHash('sha256').update(fs.readFileSync(name)).digest('hex')}));
fs.writeFileSync(dir+'/manifest.json',JSON.stringify({createdAt:new Date().toISOString(),artifacts,sources},null,2)+'\n');
console.log('Recorded '+runs.length+' real Lighthouse reports and '+artifacts.length+' artifact hashes.');
