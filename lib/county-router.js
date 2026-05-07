/**
 * Best-effort county detection for an Austin-metro street address.
 *
 * Strategy:
 *   1. ZIP code lookup (most reliable when present).
 *   2. City-name keyword match (fallback when no zip in input).
 *   3. Return null if neither rule fires; the caller can then run all
 *      CADs in parallel and pick the best match.
 *
 * Coverage focus: Travis, Williamson, Hays. Not all metro zips are
 * mapped -- only ones with high specificity to one county. Shared zips
 * (e.g. 78717 splits Travis/Williamson; 78737 splits Travis/Hays) are
 * intentionally omitted so the caller falls through to fan-out search.
 */

const ZIP_TO_COUNTY = {
  // Travis (City of Austin core)
  78701: "travis", 78702: "travis", 78703: "travis", 78704: "travis",
  78705: "travis", 78712: "travis", 78721: "travis", 78722: "travis",
  78723: "travis", 78724: "travis", 78725: "travis", 78731: "travis",
  78735: "travis", 78736: "travis", 78739: "travis", 78741: "travis",
  78742: "travis", 78744: "travis", 78745: "travis", 78746: "travis",
  78747: "travis", 78748: "travis", 78749: "travis", 78750: "travis",
  78751: "travis", 78752: "travis", 78753: "travis", 78754: "travis",
  78756: "travis", 78757: "travis", 78758: "travis", 78759: "travis",
  // Travis (Lakeway / Bee Cave / West Lake Hills / Lago Vista)
  78732: "travis", 78733: "travis", 78734: "travis", 78738: "travis",
  78645: "travis", 78669: "travis",
  // Travis (Manor / Pflugerville-ish; 78660 shared so omitted)
  78653: "travis", 78754: "travis", 78617: "travis",

  // Williamson (Cedar Park / Round Rock / Leander / Georgetown / Hutto / Taylor)
  78613: "williamson", 78626: "williamson", 78628: "williamson",
  78630: "williamson", 78633: "williamson", 78634: "williamson",
  78641: "williamson", 78642: "williamson", 78664: "williamson",
  78665: "williamson", 78673: "williamson", 78674: "williamson",
  78680: "williamson", 78681: "williamson", 78682: "williamson",
  76527: "williamson", 76530: "williamson", 76537: "williamson",
  76574: "williamson",

  // Hays (Buda / Kyle / San Marcos / Dripping Springs / Wimberley / Driftwood)
  78610: "hays", 78619: "hays", 78620: "hays", 78640: "hays",
  78648: "hays", 78656: "hays", 78666: "hays", 78667: "hays",
  78676: "hays",
};

const CITY_TO_COUNTY = [
  // Williamson
  ["CEDAR PARK", "williamson"],
  ["ROUND ROCK", "williamson"],
  ["LEANDER", "williamson"],
  ["GEORGETOWN", "williamson"],
  ["LIBERTY HILL", "williamson"],
  ["HUTTO", "williamson"],
  ["TAYLOR", "williamson"],
  ["GRANGER", "williamson"],
  ["FLORENCE", "williamson"],
  ["BARTLETT", "williamson"],
  ["JARRELL", "williamson"],
  ["THRALL", "williamson"],
  ["WEIR", "williamson"],

  // Hays
  ["DRIPPING SPRINGS", "hays"],
  ["WIMBERLEY", "hays"],
  ["BUDA", "hays"],
  ["KYLE", "hays"],
  ["SAN MARCOS", "hays"],
  ["DRIFTWOOD", "hays"],
  ["MOUNTAIN CITY", "hays"],
  ["NIEDERWALD", "hays"],
  ["UHLAND", "hays"],

  // Travis (placed last so Williamson/Hays cities win on shared "Austin"
  // suffixes that some MLS feeds use)
  ["AUSTIN", "travis"],
  ["BEE CAVE", "travis"],
  ["LAKEWAY", "travis"],
  ["WEST LAKE HILLS", "travis"],
  ["WESTLAKE HILLS", "travis"],
  ["ROLLINGWOOD", "travis"],
  ["SUNSET VALLEY", "travis"],
  ["LAGO VISTA", "travis"],
  ["VOLENTE", "travis"],
  ["JONESTOWN", "travis"],
  ["MANOR", "travis"],
  ["DEL VALLE", "travis"],
];

/**
 * Detect county from a free-form address string.
 *
 * @param {string} address
 * @returns {"travis"|"williamson"|"hays"|null}
 */
export function detectCounty(address) {
  if (!address || typeof address !== "string") return null;
  const upper = address.toUpperCase();

  // Zip-first: 5-digit zip near the end of the string is most reliable.
  const zipMatch = upper.match(/\b(7[68]\d{3})\b/);
  if (zipMatch) {
    const c = ZIP_TO_COUNTY[Number(zipMatch[1])];
    if (c) return c;
  }

  // City-name fallback. Use word-boundary check to avoid "AUSTIN AVE" in
  // a Round Rock address triggering Travis.
  for (const [city, county] of CITY_TO_COUNTY) {
    const re = new RegExp(`(^|[^A-Z])${city.replace(/ /g, "\\s+")}([^A-Z]|$)`);
    if (re.test(upper)) return county;
  }

  return null;
}

/**
 * Whether to run City-of-Austin-specific tools (permits, code cases,
 * zoning, 311). True if the address looks like it's in the City of Austin
 * jurisdiction (Travis County + an Austin-implying city/zip). Returns
 * false for clearly non-Austin Travis cities (Lakeway, Bee Cave,
 * Westlake) to avoid noisy "no record" output.
 */
export function looksLikeCityOfAustin(address) {
  if (!address) return false;
  const upper = address.toUpperCase();
  // Non-Austin Travis cities -- skip city-of-Austin SODA tools.
  if (/\b(LAKEWAY|BEE\s*CAVE|WEST\s*LAKE\s*HILLS|WESTLAKE\s*HILLS|ROLLINGWOOD|SUNSET\s*VALLEY|LAGO\s*VISTA|VOLENTE|JONESTOWN|MANOR|DEL\s*VALLE|PFLUGERVILLE)\b/.test(upper)) {
    return false;
  }
  // Default: if county detects to Travis, assume City of Austin proper.
  return detectCounty(address) === "travis";
}
