// Public reference identifiers only; no patient data or private credentials.
import fs from "node:fs";
import { createRxNorm } from "../../server/v1/rxnorm.js";
const provider = createRxNorm();
const products = [];
for (const externalId of ["198440", "857004"]) {
  products.push({ product: await provider.resolve(externalId), evidence: await provider.ingredients(externalId) });
}
if (products.some(x => !x.evidence.ingredients.length)) throw Error("Missing live ingredient evidence");
const report = { runAt: new Date().toISOString(), source: "NLM RxNorm public API", products, limitation: "Live reference retrieval only; no clinical validation or real patient testing." };
fs.writeFileSync(new URL("../../docs/evidence/step32-live.json",import.meta.url),JSON.stringify(report,null,2)+"\n");
console.log(products.map(x => ({ product: x.product.displayName, ingredients: x.evidence.ingredients })));
