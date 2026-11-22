import { createRequire } from "node:module";

const require = createRequire(new URL("../server/package.json", import.meta.url));
const { MongoClient } = createRequire(require.resolve("mongoose/package.json"))("mongodb");
const port=Number(process.env.MEDIMATE_MONGO_PORT||27028);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('MEDIMATE_MONGO_PORT must be an integer from 1024 to 65535.');
const client = new MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`);
try {
  const admin = client.db("admin");
  try {
    await admin.command({ replSetInitiate: {
      _id: "assignment03", members: [{ _id: 0, host: `127.0.0.1:${port}` }],
    } });
  } catch (error) {
    if (error.codeName !== "AlreadyInitialized") throw error;
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    if ((await admin.command({ hello: 1 })).isWritablePrimary) {
      console.log(`Assignment 03 MongoDB replica set is ready on port ${port}.`);
      process.exitCode = 0;
      break;
    }
    process.exitCode = 1;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
} finally {
  await client.close();
}
