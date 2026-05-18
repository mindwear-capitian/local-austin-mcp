/**
 * U.S. Census geocoder client. Free, no key, public endpoint.
 *
 * Returns { lng, lat, matched_address, zip } for a one-line street address.
 */
import { retryFetch } from "./retry.js";

const ENDPOINT =
  "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

/**
 * Geocode a one-line U.S. street address. Returns null on no match.
 *
 * @param {string} address  Free-form street address (e.g. "9501 San Lucas Dr Austin TX")
 * @returns {Promise<null | { lng: number, lat: number, matched_address: string, zip: string, city: string, state: string }>}
 */
export async function geocodeAddress(address) {
  if (!address || typeof address !== "string") {
    throw new Error("geocodeAddress requires a non-empty string");
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set("address", address.trim());
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");

  const res = await retryFetch(
    (signal) => fetch(url, { headers: { Accept: "application/json" }, signal }),
    { source: "U.S. Census geocoder", profile: "fast", url: url.toString() }
  );
  if (!res.ok) {
    throw new Error(`Census geocoder rejected: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const matches = data?.result?.addressMatches ?? [];
  if (matches.length === 0) return null;

  const m = matches[0];
  return {
    lng: m.coordinates?.x,
    lat: m.coordinates?.y,
    matched_address: m.matchedAddress,
    zip: m.addressComponents?.zip ?? null,
    city: m.addressComponents?.city ?? null,
    state: m.addressComponents?.state ?? null,
  };
}
