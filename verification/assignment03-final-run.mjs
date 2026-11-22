import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { members } from "./assignment03.mjs";

const require = createRequire(new URL("../../assignment03-tools/package.json", import.meta.url));
const newman = require("newman");
const directory = path.resolve(process.argv[2] || ".local-data/collections");
const results = [];
for (const member of members) {
  const collection = JSON.parse(fs.readFileSync(path.join(directory, `MediMate_Assignment03_${member.slug}.postman_collection.json`)));
  const summary = await new Promise((resolve, reject) => newman.run({
    collection, reporters: [], timeoutRequest: 30000, timeoutScript: 60000,
  }, (error, run) => error ? reject(error) : resolve(run)));
  const result = {
    name: member.name, port: member.port,
    requests: summary.run.stats.requests, assertions: summary.run.stats.assertions,
    failures: summary.run.failures.map(({source,error})=>({request:source?.name,message:error.message})),
    entries: summary.run.executions.map(({item,response,assertions})=>({
      name:item.name,status:response?.code,failed:assertions?.filter(a=>a.error).length??0,
    })),
    captures: collection.item.flatMap(f=>f.item).filter(i=>/^[ABC]\d-\d\d /.test(i.name)).map(i=>i.name),
  };
  results.push(result);
  console.log(JSON.stringify({name:result.name,port:result.port,requests:result.requests,assertions:result.assertions,failures:result.failures}));
  fs.writeFileSync(".local-data/results/final-collections.json", JSON.stringify({
    date:new Date().toISOString(), mode:"Live RxNorm and openFDA; Telegram disabled; local MongoDB replica set", results,
  },null,2));
  if (result.failures.length) process.exitCode = 1;
}
