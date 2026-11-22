// Procedural synthetic test input, not a real prescription or user attachment.
// Uses the same installed Tesseract engine as the frontend, in a Node worker.
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {createWorker} from "tesseract.js";
const require=createRequire(import.meta.url),out="output/step38",cache=".local-data/step38-ocr";
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(cache,{recursive:true});
let worker;
const report={runAt:new Date().toISOString(),engine:"installed tesseract.js",context:"Node/WASM engine, synthetic locally generated PNGs; no browser upload or real prescription",status:"unavailable",recognitions:[]};
const save=()=>fs.writeFileSync("docs/evidence/step38-ocr.json",JSON.stringify(report,null,2)+"\n");
const deadline=setTimeout(()=>{report.reason="OCR audit exceeded 45 seconds";save();process.exit(1);},45000);
try{
  const sharp=require(process.env.MEDIMATE_SHARP_PATH||"sharp");
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="220"><rect width="100%" height="100%" fill="white"/><g fill="black" font-family="Arial" font-size="38"><text x="30" y="60">SYNTHETIC OCR CHECK</text><text x="30" y="120">ALPHA TEST 12345</text><text x="30" y="180">NO MEDICAL DIRECTIONS</text></g></svg>');
  const clear=await sharp(svg).png().toBuffer(),blurred=await sharp(clear).blur(8).png().toBuffer();
  fs.writeFileSync(out+"/clear.png",clear);fs.writeFileSync(out+"/blurred.png",blurred);
  worker=await createWorker("eng",1,{cachePath:path.resolve(cache),errorHandler:()=>{}});
  for(const [kind,bytes] of [["clear",clear],["blurred",blurred]]){
    const {data}=await worker.recognize(bytes);
    report.recognitions.push({kind,file:out+"/"+kind+".png",sha256:createHash("sha256").update(bytes).digest("hex"),sizeBytes:bytes.length,text:data.text,confidence:data.confidence});
  }
  const a=report.recognitions[0],b=report.recognitions[1];
  report.clearControlRecognized=a.text.includes("ALPHA TEST 12345");
  report.blurDegraded=b.confidence<a.confidence||!b.text.includes("ALPHA TEST 12345");
  report.status=report.clearControlRecognized&&report.blurDegraded?"passed":"failed";
  if(report.status!=="passed")process.exitCode=1;
}catch(error){report.reason=String(error.message||error).slice(0,300);process.exitCode=1;}
finally{clearTimeout(deadline);if(worker)await worker.terminate();save();console.log({status:report.status,confidence:report.recognitions.map(x=>({kind:x.kind,confidence:x.confidence}))});}
