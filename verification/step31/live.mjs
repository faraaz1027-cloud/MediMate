import { createOverpass, overpassUrl } from "../../server/v1/overpass.js";

// Public area in Dhaka. This probe uses no session or patient data.
const center = { latitude: 23.7465, longitude: 90.376, radiusMeters: 700 };
const attemptedAt = new Date().toISOString();
let httpStatus = null;
const overpass = createOverpass({
  fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    httpStatus = response.status;
    return response;
  },
});
try {
  const result = await overpass.search(
    center.latitude,
    center.longitude,
    center.radiusMeters,
  );
  console.log(
    JSON.stringify(
      {
        attemptedAt,
        center,
        httpStatus,
        sourceUrl: result.sourceUrl,
        retrievedAt: result.retrievedAt,
        dataTimestamp: result.dataTimestamp,
        listings: result.listings.length,
        sampleListing: result.listings[0]?.listingUrl,
      },
      null,
      2,
    ),
  );
  if (!result.listings.length) process.exitCode = 1;
} catch (error) {
  console.log(
    JSON.stringify(
      {
        attemptedAt,
        center,
        sourceUrl: overpassUrl,
        httpStatus,
        outcome: error.name === "TimeoutError" ? "timeout" : "unavailable",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
