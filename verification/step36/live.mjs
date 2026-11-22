// One public area query only. No incident, contact or clinical data is transmitted.
import fs from "node:fs";
import {createOverpass} from "../../server/v1/overpass.js";
const area={latitude:23.7465,longitude:90.376,radiusMeters:5000};
let result,httpStatus=null;const started=Date.now();
const fetchImpl=async(...args)=>{const response=await fetch(...args);httpStatus=response.status;return response;};
try{result={runAt:new Date().toISOString(),status:"available",area,...await createOverpass({amenity:"hospital",fetchImpl}).search(area.latitude,area.longitude,area.radiusMeters),limitation:"Public map listings only; no capacity or ambulance availability verified."};}
catch{result={runAt:new Date().toISOString(),status:"unavailable",area,limitation:"Configured Overpass endpoint did not return a usable complete response. No live hospital listing is claimed."};}
Object.assign(result,{httpStatus,elapsedMs:Date.now()-started,sourceUrl:"https://overpass-api.de/api/interpreter"});
fs.writeFileSync(new URL("../../docs/evidence/step36-hospitals-live.json",import.meta.url),JSON.stringify(result,null,2)+"\n");
console.log({status:result.status,httpStatus,listings:result.listings?.length??null});
