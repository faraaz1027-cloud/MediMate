export const overpassUrl = "https://overpass-api.de/api/interpreter";

function coordinate(value, max) {
  return Number.isFinite(value) && Math.abs(value) <= max;
}

export function validArea(latitude, longitude, radiusMeters) {
  return (
    coordinate(latitude, 90) &&
    coordinate(longitude, 180) &&
    Number.isInteger(radiusMeters) &&
    radiusMeters >= 100 &&
    radiusMeters <= 5000
  );
}

function distanceMeters(lat, lon, otherLat, otherLon) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((otherLat - lat) * rad) / 2) ** 2 +
    Math.cos(lat * rad) *
      Math.cos(otherLat * rad) *
      Math.sin(((otherLon - lon) * rad) / 2) ** 2;
  return Math.round(12742000 * Math.asin(Math.sqrt(Math.min(1, a))));
}

function tag(value) {
  return typeof value === "string" ? value.trim().slice(0, 200) : "";
}

function listing(row, center) {
  const latitude = row?.type === "node" ? row.lat : row?.center?.lat;
  const longitude = row?.type === "node" ? row.lon : row?.center?.lon;
  if (
    !["node", "way", "relation"].includes(row?.type) ||
    !Number.isSafeInteger(row.id) ||
    row.id <= 0 ||
    row.tags?.amenity !== "pharmacy" ||
    !coordinate(latitude, 90) ||
    !coordinate(longitude, 180)
  )
    return null;
  const distance = distanceMeters(
    center.latitude,
    center.longitude,
    latitude,
    longitude,
  );
  if (distance > center.radiusMeters) return null;
  const tags = row.tags;
  const street = [tag(tags["addr:housenumber"]), tag(tags["addr:street"])]
    .filter(Boolean)
    .join(" ");
  return {
    externalPlaceKey: row.type + "/" + row.id,
    name: tag(tags.name) || tag(tags.brand) || "Unnamed pharmacy listing",
    latitude,
    longitude,
    distanceMeters: distance,
    phone: tag(tags["contact:phone"]) || tag(tags.phone),
    address: [street, tag(tags["addr:place"]), tag(tags["addr:city"])]
      .filter(Boolean)
      .join(", "),
    openingHours: tag(tags.opening_hours),
    listingUrl: "https://www.openstreetmap.org/" + row.type + "/" + row.id,
  };
}

// Only a rounded center and bounded radius enter the provider query.
export function createOverpass({
  fetchImpl = fetch,
  clock = () => Date.now(),
  timeoutMs = 10000,
  spacingMs = 1000,
  dailyLimit = 75,
} = {}) {
  const cache = new Map();
  let pending,
    lastStart = -Infinity,
    retryAt = 0,
    day,
    requests = 0;
  return {
    async search(latitude, longitude, radiusMeters) {
      if (!validArea(latitude, longitude, radiusMeters))
        throw Error("Invalid area.");
      const lat = latitude.toFixed(4),
        lon = longitude.toFixed(4);
      const key = [radiusMeters, lat, lon].join(",");
      const at = clock();
      if (cache.get(key)?.expires > at) return cache.get(key).value;
      if (pending?.key === key) return pending.job;
      const today = new Date(at).toISOString().slice(0, 10);
      if (today !== day) {
        day = today;
        requests = 0;
      }
      if (
        pending ||
        at < retryAt ||
        at - lastStart < spacingMs ||
        requests >= dailyLimit
      )
        throw Error("Overpass temporarily unavailable.");
      requests++;
      lastStart = at;
      const job = (async () => {
        const response = await fetchImpl(overpassUrl, {
          method: "POST",
          body: new URLSearchParams({
            data: `[out:json][timeout:7][maxsize:16777216];nwr(around:${key})["amenity"="pharmacy"];out body center 301;`,
          }),
          headers: {
            Accept: "application/json",
            "User-Agent":
              "MediMate-A4/1.0 (+https://github.com/faraaz1027-cloud/MediMate)",
          },
          redirect: "error",
          signal: AbortSignal.timeout(timeoutMs),
        });
        if ([406, 429].includes(response.status)) retryAt = clock() + 60000;
        if (!response.ok || !response.body) {
          await response.body?.cancel();
          throw Error("Overpass response unavailable.");
        }
        const chunks = [];
        let bytes = 0;
        for await (const chunk of response.body) {
          bytes += chunk.byteLength;
          if (bytes > 1024 * 1024) throw Error("Overpass response too large.");
          chunks.push(chunk);
        }
        const raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (
          !Array.isArray(raw?.elements) ||
          raw.elements.length > 301 ||
          raw.remark
        )
          throw Error("Overpass returned an incomplete response.");
        const center = {
          latitude: Number(lat),
          longitude: Number(lon),
          radiusMeters,
        };
        const distinct = new Map();
        for (const row of raw.elements) {
          const item = listing(row, center);
          if (item) distinct.set(item.externalPlaceKey, item);
        }
        const ordered = [...distinct.values()].sort(
          (a, b) =>
            a.distanceMeters - b.distanceMeters ||
            a.externalPlaceKey.localeCompare(b.externalPlaceKey),
        );
        const dataTimestamp = raw.osm3s?.timestamp_osm_base;
        const value = {
          sourceUrl: overpassUrl,
          retrievedAt: new Date(clock()).toISOString(),
          dataTimestamp:
            typeof dataTimestamp === "string" &&
            Number.isFinite(Date.parse(dataTimestamp))
              ? new Date(dataTimestamp).toISOString()
              : null,
          listings: ordered.slice(0, 20),
          limited: ordered.length > 20 || raw.elements.length === 301,
        };
        if (cache.size >= 100) cache.delete(cache.keys().next().value);
        cache.set(key, { expires: clock() + 5 * 60000, value });
        return value;
      })();
      pending = { key, job };
      try {
        return await job;
      } finally {
        pending = null;
      }
    },
  };
}
