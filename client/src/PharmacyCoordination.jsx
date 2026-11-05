import { useEffect, useRef, useState } from "react";
import ValidatedForm from "./ValidatedForm.jsx";

export function PharmacyListing({ listing, retrievedAt }) {
  return (
    <>
      <p>
        <a href={listing.listingUrl} target="_blank" rel="noreferrer">
          {listing.name} on OpenStreetMap
        </a>
      </p>
      <p>
        {listing.address || "Address unavailable"} · {listing.latitude},{" "}
        {listing.longitude}
      </p>
      <p>Listed phone {listing.phone || "unavailable"}</p>
      <p>Listed hours {listing.openingHours || "unavailable"}</p>
      <p>Map data retrieved {new Date(retrievedAt).toLocaleString()}.</p>
    </>
  );
}

export default function PharmacyCoordination({
  api,
  base,
  lists,
  permissions,
  disabled,
  refresh,
  writeRequest,
}) {
  const stockWrite = permissions.includes("stock.write");
  const canAssign = stockWrite && permissions.includes("task.write");
  const [area, setArea] = useState({
    latitude: "",
    longitude: "",
    radiusMeters: "1000",
  });
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [searchError, setSearchError] = useState("");
  const [setupError, setSetupError] = useState("");
  const [result, setResult] = useState(null);
  const [preference, setPreference] = useState(undefined);
  const [assignees, setAssignees] = useState([]);
  const [withPharmacy, setWithPharmacy] = useState(false);
  const search = useRef(null);
  const locationEpoch = useRef(0);

  useEffect(
    () => () => {
      search.current?.abort();
      locationEpoch.current++;
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    const options = {
      signal: controller.signal,
      isCurrent: () => !controller.signal.aborted,
    };
    setSetupError("");
    Promise.all([
      api(base + "/pharmacy-preferences", options),
      canAssign ? api(base + "/task-assignees", options) : null,
    ])
      .then(([saved, people]) => {
        if (!options.isCurrent()) return;
        setPreference(saved.data);
        setAssignees(people?.data ?? []);
        setWithPharmacy(false);
      })
      .catch((e) => {
        if (options.isCurrent()) setSetupError(e.message);
      });
    return () => controller.abort();
  }, [base, canAssign, refresh]);

  function setCoordinate(key, value) {
    locationEpoch.current++;
    setLocating(false);
    setArea((old) => ({ ...old, [key]: value }));
    setResult(null);
    setSearchError("");
  }

  function locate() {
    const epoch = ++locationEpoch.current;
    const fallback = () => {
      if (epoch !== locationEpoch.current) return;
      setLocating(false);
      setLocationMessage(
        "Device location unavailable. Enter a public area center below.",
      );
    };
    setLocationMessage("");
    if (!navigator.geolocation) return fallback();
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (epoch !== locationEpoch.current) return;
        setLocating(false);
        setArea((old) => ({
          ...old,
          latitude: coords.latitude.toFixed(4),
          longitude: coords.longitude.toFixed(4),
        }));
        setResult(null);
        setSearchError("");
        setLocationMessage(
          "Location filled in. Select Search pharmacies to send the rounded center.",
        );
      },
      fallback,
      { timeout: 8000, maximumAge: 0 },
    );
  }

  async function find(e) {
    e.preventDefault();
    if (search.current) return;
    locationEpoch.current++;
    setLocating(false);
    const controller = new AbortController();
    search.current = controller;
    setSearching(true);
    setSearchError("");
    setResult(null);
    const isCurrent = () =>
      !controller.signal.aborted && search.current === controller;
    try {
      const query = new URLSearchParams({
        ...area,
        latitude: Number(area.latitude).toFixed(4),
        longitude: Number(area.longitude).toFixed(4),
      });
      const r = await api(base + "/pharmacies?" + query, {
        signal: controller.signal,
        isCurrent,
      });
      if (isCurrent()) setResult(r.data);
    } catch (e) {
      if (isCurrent()) setSearchError(e.message);
    } finally {
      if (isCurrent()) {
        search.current = null;
        setSearching(false);
      }
    }
  }

  const busy = disabled || searching;
  const openLists = lists.filter(
    (list) => list.status === "open" && !list.collectionTaskId,
  );
  return (
    <section className="card">
      <h3>Pharmacy search and collection</h3>
      <p>
        Map listings give approximate locations and contact details. Call ahead
        to confirm hours and medicine availability. Use local emergency services
        for urgent help.
      </p>
      <p>
        Search sends the rounded area center and radius to Overpass. You can use
        a public landmark as the center.
      </p>
      <button type="button" disabled={busy || locating} onClick={locate}>
        Use device location
      </button>
      {locationMessage && <p role="status">{locationMessage}</p>}
      <p>
        <a
          href="https://www.openstreetmap.org/"
          target="_blank"
          rel="noreferrer"
        >
          Find a public area on OpenStreetMap
        </a>{" "}
        and enter its decimal latitude and longitude.
      </p>
      <form onSubmit={find}>
        <fieldset disabled={busy}>
          <legend>Search area</legend>
          <label>
            Area latitude
            <input
              required
              type="number"
              step="any"
              min="-90"
              max="90"
              value={area.latitude}
              onChange={(e) => setCoordinate("latitude", e.target.value)}
            />
          </label>
          <label>
            Area longitude
            <input
              required
              type="number"
              step="any"
              min="-180"
              max="180"
              value={area.longitude}
              onChange={(e) => setCoordinate("longitude", e.target.value)}
            />
          </label>
          <label>
            Search radius (meters)
            <input
              required
              type="number"
              min="100"
              max="5000"
              value={area.radiusMeters}
              onChange={(e) => setCoordinate("radiusMeters", e.target.value)}
            />
          </label>
          <button>Search pharmacies</button>
        </fieldset>
      </form>
      {searching && <p role="status">Searching OpenStreetMap listings…</p>}
      {searchError && <p role="alert">{searchError}</p>}
      {result && (
        <>
          <p>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              © OpenStreetMap contributors
            </a>
          </p>
          {result.limited && (
            <p>
              Results are limited. Use a smaller area to see a more focused
              list.
            </p>
          )}
          {result.listings.length === 0 && (
            <p>
              No mapped pharmacy listings found in this area. Try another center
              or radius.
            </p>
          )}
          <ul className="records">
            {result.listings.map((listing) => (
              <li key={listing.externalPlaceKey}>
                <PharmacyListing
                  listing={listing}
                  retrievedAt={result.retrievedAt}
                />
                <p>
                  About {listing.distanceMeters} m from the search center in a
                  straight line.
                </p>
                {stockWrite && (
                  <button
                    disabled={busy || preference === undefined}
                    onClick={() =>
                      writeRequest(
                        base + "/pharmacy-preferences",
                        "POST",
                        {
                          externalPlaceKey: listing.externalPlaceKey,
                          selectionToken: listing.selectionToken,
                          expectedRevision: preference?.revision ?? null,
                        },
                        "Preferred pharmacy saved.",
                      )
                    }
                  >
                    Save {listing.name} as preferred pharmacy
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <h4>Saved pharmacy</h4>
      {setupError && <p role="alert">{setupError}</p>}
      {preference === null && <p>No preferred pharmacy saved.</p>}
      {preference && (
        <>
          <PharmacyListing
            listing={preference.listingSnapshot}
            retrievedAt={preference.retrievedAt}
          />
          <p>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              © OpenStreetMap contributors
            </a>
          </p>
          {preference.stale && (
            <p>
              This saved listing is stale. Search again and save a fresh listing
              to use it for collection.
            </p>
          )}
        </>
      )}
      {canAssign && openLists.length > 0 && (
        <ValidatedForm
          onSubmit={(e) => {
            const data = new FormData(e.currentTarget);
            const checklist = openLists.find(
              (list) => list.id === data.get("refillListId"),
            );
            if (!checklist) return;
            return writeRequest(
              base + "/refill-lists/" + checklist.id + "/collection-task",
              "POST",
              {
                expectedRevision: checklist.revision,
                assigneeUserId: data.get("assigneeUserId"),
                ...(withPharmacy && preference && !preference.stale
                  ? {
                      pharmacyPreferenceId: preference.id,
                      expectedPharmacyRevision: preference.revision,
                    }
                  : {}),
              },
              "Collection task created. See Caregiver tasks.",
            );
          }}
        >
          <fieldset disabled={busy || assignees.length === 0}>
            <legend>Assign refill collection</legend>
            <label>
              Refill checklist
              <select required name="refillListId" defaultValue="">
                <option value="">Choose an open checklist</option>
                {openLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.items[0]?.medicineText} · {list.items.length} item(s)
                    · {list.id.slice(-6)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Collection assignee
              <select required name="assigneeUserId" defaultValue="">
                <option value="">Choose a caregiver or owner</option>
                {assignees.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName}
                  </option>
                ))}
              </select>
            </label>
            {preference && !preference.stale && (
              <label>
                <input
                  type="checkbox"
                  checked={withPharmacy}
                  onChange={(e) => setWithPharmacy(e.target.checked)}
                />{" "}
                Include saved pharmacy
              </label>
            )}
            <button>Create collection task</button>
          </fieldset>
        </ValidatedForm>
      )}
    </section>
  );
}
