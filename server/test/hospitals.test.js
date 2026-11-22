import test from "node:test";
import assert from "node:assert/strict";
import {createOverpass} from "../v1/overpass.js";
test("hospital map adapter fixes the amenity query and excludes pharmacy/capacity claims",async()=>{
  let query;
  const adapter=createOverpass({amenity:"hospital",spacingMs:0,fetchImpl:async(_,options)=>{query=options.body.get("data");return Response.json({elements:[{type:"node",id:1,lat:23.74,lon:90.37,tags:{amenity:"hospital",name:"Synthetic hospital"}},{type:"node",id:2,lat:23.74,lon:90.37,tags:{amenity:"pharmacy",name:"Synthetic pharmacy"}}]});}});
  const result=await adapter.search(23.74,90.37,5000);assert.match(query,/"amenity"="hospital"/);assert.equal(result.listings.length,1);assert.equal(result.listings[0].name,"Synthetic hospital");assert.ok(!("ambulanceAvailable" in result.listings[0]));
  assert.throws(()=>createOverpass({amenity:'hospital"; malicious'}));
});
