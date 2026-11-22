import { createOpenFDA } from "../../server/v1/openfda.js";
export const fixtureId = "11111111-1111-4111-8111-111111111111",
  wrongId = "22222222-2222-4222-8222-222222222222";
export function fixtureLabel(id = fixtureId, rxcui = "198440") {
  return {
    id,
    set_id: "33333333-3333-4333-8333-333333333333",
    version: "1",
    effective_time: "20260101",
    openfda: {
      rxcui: [rxcui],
      brand_name: ["Synthetic label fixture"],
      generic_name: ["SYNTHETIC INGREDIENT"],
      manufacturer_name: ["Test fixture, not a manufacturer"],
      route: ["ORAL"],
      product_ndc: ["00000-0000"],
      substance_name: ["SYNTHETIC INGREDIENT"],
      product_type: ["CONTROLLED TEST DATA"],
    },
    warnings: [
      "Synthetic warning fixture — not medical guidance.  Preserve original spacing.\nSecond line.",
    ],
    storage_and_handling: ["Synthetic storage fixture."],
    active_ingredient: ["Synthetic ingredient fixture 500 mg"],
  };
}
export function openFDAFixture() {
  const control = { down: false, empty: false, changed: false, requests: [] };
  const adapter = createOpenFDA({
    spacingMs: 0,
    fetchImpl: async (url) => {
      control.requests.push(url);
      if (control.down) throw Error("Controlled openFDA outage");
      const search = new URL(url).searchParams.get("search"),
        record = fixtureLabel(
          search.includes(wrongId) ? wrongId : fixtureId,
          search.includes(wrongId) ? "999" : "198440",
        );
      if (control.changed) {
        record.version = "2";
        record.warnings = ["Changed synthetic warning fixture."];
      }
      if (control.empty)
        return Response.json(
          { error: { code: "NOT_FOUND", message: "No matches found!" } },
          { status: 404 },
        );
      return Response.json({
        meta: { results: { total: search.startsWith("id:") ? 1 : 6 } },
        results: [record],
      });
    },
  });
  return { ...control, adapter, control };
}
