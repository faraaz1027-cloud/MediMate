import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createV1 } from "../server/v1/app.js";
import { db } from "../server/v1/store.js";
import { members, build } from "./assignment03.mjs";
import { createRxNorm } from "../server/v1/rxnorm.js";
import { openFDAFixture } from "./step26/fixture.mjs";

const serverRequire = createRequire(new URL("../server/package.json", import.meta.url));
const verificationRequire = createRequire(new URL("./step18/package.json", import.meta.url));
const newman = createRequire(path.resolve(process.argv[2], "package.json"))("newman");
const mongoose = serverRequire("mongoose");
const express = serverRequire("express");
const { MongoMemoryReplSet } = verificationRequire("mongodb-memory-server");
const report = path.resolve(process.argv[3]);
const live = process.argv.includes("--live");

const rxnorm = createRxNorm({ spacingMs: 0, fetchImpl: async (url) => {
  const id = url.includes("198440") ? "198440" : "596928";
  const product = { rxcui:id, tty:"SBD", suppress:"N", name:id === "596928"
    ? "duloxetine 60 MG Delayed Release Oral Capsule [Cymbalta]" : "acetaminophen 500 MG Oral Tablet" };
  return Response.json(url.includes("drugs.json")
    ? {drugGroup:{conceptGroup:[{conceptProperties:[product]}]}} : {properties:product});
} });
const replica = await MongoMemoryReplSet.create({
  binary:{version:"7.0.24"},
  ...(process.env.MONGOMS_DB_PATH ? {instanceOpts:[{dbPath:process.env.MONGOMS_DB_PATH}]} : {}),
  replSet:{count:1},
});
const results = [];
try {
  await mongoose.connect(replica.getUri(), {dbName:"assignment03_synthetic"});
  await db.init();
  for (const member of members.filter((m) => !live || m.port === 1205)) {
    const app = express();
    app.use("/api/v1",createV1({ db, telegram:{enabled:false},
      ...(live ? {} : {rxnorm, openfda:openFDAFixture().adapter}),
    }));
    const server = await new Promise((resolve,reject) => {
      const listening = app.listen(member.port,"127.0.0.1",()=>resolve(listening));
      listening.once("error",reject);
    });
    try {
      const summary = await new Promise((resolve,reject) => {
        newman.run({collection:build(member), timeoutRequest:15000, timeoutScript:60000, reporters:[]},
          (error, summary) => error ? reject(error) : resolve(summary));
      });
      const {requests, assertions} = summary.run.stats;
      const failures = summary.run.failures.map(({source,error})=>({request:source?.name,message:error.message}));
      const entries = summary.run.executions.map(({item,response,assertions}) => ({
        name:item.name,status:response?.code,failed:assertions?.filter(a=>a.error).length ?? 0,
      }));
      const result = {name:member.name,port:member.port,requests,assertions,failures,entries};
      results.push(result);
      console.log(JSON.stringify({name:result.name,requests,assertions,failures}));
      if (failures.length) process.exitCode = 1;
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }
} finally {
  fs.writeFileSync(report, JSON.stringify({mode:live?"live RxNorm and openFDA":"controlled RxNorm and openFDA; Telegram disabled",results},null,2));
  await mongoose.disconnect();
  await replica.stop();
}
