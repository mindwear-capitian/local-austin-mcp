/**
 * FEMA NFHL flood-zone client.
 *
 * Workflow:
 *   1) Geocode address -> lat/long via the U.S. Census geocoder (free, no key)
 *   2) Spatial point query against FEMA NFHL Layer 28 (Flood Hazard Zones)
 *      to determine the FEMA flood zone for that point
 *
 * NFHL service:
 *   https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer
 *
 * Census geocoder:
 *   https://geocoding.geo.census.gov/geocoder/locations/onelineaddress
 */

const NFHL_LAYER = 28; // Flood Hazard Zones
const NFHL_BASE =
  "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer";
const CENSUS_GEOCODER =
  "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

/**
 * Geocode an address (one-line) to {longitude, latitude, matched_address, zip}.
 * Returns null if no match.
 */
export async function geocodeAddress(oneLineAddress) {
  if (!oneLineAddress || oneLineAddress.trim().length < 3) {
    throw new Error("geocodeAddress requires an address string");
  }

  const url = new URL(CENSUS_GEOCODER);
  url.searchParams.set("address", oneLineAddress);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(
      `Census geocoder failed: ${res.status} ${res.statusText}`
    );
  }
  const data = await res.json();
  const match = data?.result?.addressMatches?.[0];
  if (!match) return null;

  return {
    longitude: match.coordinates?.x ?? null,
    latitude: match.coordinates?.y ?? null,
    matched_address: match.matchedAddress ?? null,
    zip: match.addressComponents?.zip ?? null,
    city: match.addressComponents?.city ?? null,
    state: match.addressComponents?.state ?? null,
    tiger_line_id: match.tigerLine?.tigerLineId ?? null,
  };
}

/**
 * Look up FEMA flood zone at a point.
 *
 * @param {number} longitude - WGS84
 * @param {number} latitude - WGS84
 * @returns {Promise<object|null>} Flood zone info or null if no NFHL coverage
 */
export async function floodZoneAtPoint(longitude, latitude) {
  if (
    typeof longitude !== "number" ||
    typeof latitude !== "number" ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude)
  ) {
    throw new Error("floodZoneAtPoint requires numeric longitude and latitude");
  }

  const url = new URL(`${NFHL_BASE}/${NFHL_LAYER}/query`);
  url.searchParams.set("geometry", `${longitude},${latitude}`);
  url.searchParams.set("geometryType", "esriGeometryPoint");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set(
    "outFields",
    "FLD_ZONE,ZONE_SUBTY,STATIC_BFE,DEPTH,SFHA_TF,DFIRM_ID"
  );
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("f", "json");

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`FEMA NFHL query failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(`FEMA NFHL error: ${JSON.stringify(data.error).slice(0, 200)}`);
  }
  const feature = data?.features?.[0];
  if (!feature) {
    // No NFHL coverage at this point -- common in unmapped rural areas
    return null;
  }

  const a = feature.attributes ?? {};
  const fld = a.FLD_ZONE ?? null;
  const sfha = (a.SFHA_TF ?? "").toUpperCase() === "T";
  return {
    flood_zone: fld,
    zone_subtype: a.ZONE_SUBTY || null,
    in_sfha: sfha,
    static_bfe: nullSentinel(a.STATIC_BFE),
    depth: nullSentinel(a.DEPTH),
    dfirm_id: a.DFIRM_ID ?? null,
    interpretation: interpretZone(fld, sfha),
    source: "FEMA NFHL Layer 28 (Flood Hazard Zones)",
    source_url: `${NFHL_BASE}/${NFHL_LAYER}`,
  };
}

function nullSentinel(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n === -9999 || n === -9999.0) return null;
  return n;
}

/**
 * Plain-English summary of a FEMA flood zone code.
 */
function interpretZone(zone, inSfha) {
  if (!zone) return "Unknown -- no FEMA NFHL feature at this point.";
  const z = zone.toUpperCase();
  // High-risk Special Flood Hazard Areas (1% annual chance, "100-year")
  if (z === "A" || z === "AE" || z.startsWith("A")) {
    return (
      "Zone A/AE -- 1% annual-chance flood (100-year) HIGH RISK. " +
      "Federally backed mortgages REQUIRE flood insurance."
    );
  }
  if (z === "V" || z === "VE" || z.startsWith("V")) {
    return (
      "Zone V/VE -- coastal high-hazard with wave action. Federally " +
      "backed mortgages REQUIRE flood insurance. Highest risk tier."
    );
  }
  if (z === "X" || z === "X500") {
    return inSfha
      ? "Zone X (shaded) -- moderate risk, 0.2% annual chance (500-year). " +
        "Insurance not federally required but recommended."
      : "Zone X -- minimal flood hazard. Outside the 1% and 0.2% annual-chance " +
        "floodplains. Insurance NOT federally required.";
  }
  if (z === "D") {
    return "Zone D -- undetermined risk. FEMA has not studied this area.";
  }
  if (z.startsWith("AO") || z.startsWith("AH")) {
    return (
      "Zone AO/AH -- shallow flooding (sheet flow / ponding). 1% annual " +
      "chance. Federally backed mortgages REQUIRE flood insurance."
    );
  }
  return `Zone ${zone}${inSfha ? " (in SFHA)" : ""}.`;
}
