import { createRxNorm } from "../../server/v1/rxnorm.js";
export function module1RxNormFixture() {
  return createRxNorm({
    spacingMs: 0,
    fetchImpl: async (url) => {
      if (url.includes("module1-deliberate-outage"))
        throw Error("Controlled test-only RxNorm outage");
      const p = {
        rxcui: "596928",
        name: "duloxetine 20 MG Delayed Release Oral Capsule [Cymbalta]",
        tty: "SBD",
        suppress: "N",
      };
      return Response.json(
        url.includes("drugs.json")
          ? {
              drugGroup: {
                conceptGroup: [
                  {
                    conceptProperties: [
                      p,
                      {
                        ...p,
                        rxcui: "596932",
                        name: "duloxetine 30 MG Delayed Release Oral Capsule [Cymbalta]",
                      },
                    ],
                  },
                ],
              },
            }
          : { properties: p },
      );
    },
  });
}
