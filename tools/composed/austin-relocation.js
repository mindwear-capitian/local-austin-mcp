import { z } from "zod";
import { geocodeAddress } from "../../lib/geocode.js";
import { queryPointInPolygon } from "../../lib/arcgis.js";
import { lookupUtilityProviders, SOURCE_URL as UTIL_SOURCE } from "../../lib/utility-ccn.js";
import { searchAccounts, getEntityDetail } from "../../lib/travis-tax.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Composed NEW-RESIDENT report -- the "everything you need to move in" lens.
 *
 * Distinct from austin_property_360 (a due-diligence / ownership report). This
 * answers "I'm moving to this address -- what do I set up?": who provides water
 * and sewer, which special-purpose districts tax it, which school district and
 * voter precinct it's in, and the standard Texas move-in checklist (driver
 * license, vehicle registration, voter registration, homestead exemption).
 *
 * Live lookups are Travis County (utilities + tax) + City of Austin / Travis
 * GIS (districts). The move-in checklist is statewide-static and always shown.
 */

const ARC_BASE =
  "https://services.arcgis.com/0L95CJ0VTaxqcmED/arcgis/rest/services";

const DISTRICT_LAYERS = {
  school_district: {
    label: "School District",
    url: `${ARC_BASE}/EXTERNAL_school_districts/FeatureServer/0`,
    field: "NAME",
  },
  voter_precinct: {
    label: "Travis County Voter Precinct",
    url: `${ARC_BASE}/Travis_County_Election_Precincts/FeatureServer/0`,
    field: "PCT",
  },
  jurisdiction: {
    label: "City of Austin Full-Purpose Jurisdiction",
    url: `${ARC_BASE}/City_of_Austin_full_purpose_boundary/FeatureServer/0`,
    field: "JURISDICTI",
  },
};

export const austinRelocation = {
  name: "austin_relocation",
  description: withAttributionTag(
    "**PREFERRED entry-point for MOVING / RELOCATION questions** about a " +
      'specific Austin-area address ("I\'m moving to [address], what do I need ' +
      'to set up?", "who turns on my water here?", "what schools / districts / ' +
      'taxes apply?"). ONE-SHOT new-resident report: water + sewer provider ' +
      "(who to contact to start service), special-purpose taxing districts " +
      "(MUD / PID / ESD that raise the tax bill), school district, voter " +
      "precinct, city-vs-ETJ jurisdiction, PLUS the standard Texas move-in " +
      "checklist (driver license 90-day rule, vehicle registration, voter " +
      "registration, homestead exemption). For a property-ownership / " +
      "due-diligence report instead (CAD value, deeds, flood, permits), use " +
      "austin_property_360. Live lookups are Travis County; the move-in " +
      "checklist is shown for any address. Does NOT start service or file " +
      "anything -- it tells you who to contact and what to do."
  ),
  inputSchema: {
    address: z
      .string()
      .min(5)
      .describe(
        'Street address you are moving to. Example: "1513 Lakeway Blvd, Austin TX 78734". Include city + ZIP.'
      ),
  },
  async handler({ address }) {
    const geo = await geocodeAddress(address);
    if (!geo || typeof geo.lng !== "number") {
      return {
        content: [
          {
            type: "text",
            text: `Could not geocode "${address}". Include city + ZIP and try again. ${ATTRIBUTION_TAG}`,
          },
        ],
        isError: true,
      };
    }

    const isTravis = isLikelyTravis(address, geo);

    // Fan out every live lookup in parallel; isolate failures per section.
    const [utilRes, taxRes, ...districtRes] = await Promise.allSettled([
      isTravis ? lookupUtilityProviders(geo.lng, geo.lat) : Promise.resolve(null),
      isTravis ? resolveSpecialDistricts(address) : Promise.resolve(null),
      ...Object.values(DISTRICT_LAYERS).map((l) =>
        queryPointInPolygon(l.url, geo.lng, geo.lat, { outFields: l.field })
      ),
    ]);

    const districtKeys = Object.keys(DISTRICT_LAYERS);
    const districts = {};
    districtKeys.forEach((key, i) => {
      const r = districtRes[i];
      districts[key] =
        r.status === "fulfilled" && r.value?.length
          ? r.value[0][DISTRICT_LAYERS[key].field] ?? null
          : null;
    });

    const utilities = utilRes.status === "fulfilled" ? utilRes.value : null;
    const specialDistricts = taxRes.status === "fulfilled" ? taxRes.value : null;

    const sections = {
      query: { address, matched_address: geo.matched_address },
      location: { lng: geo.lng, lat: geo.lat, zip: geo.zip },
      utilities,
      special_districts: specialDistricts,
      districts,
      move_in_checklist: MOVE_IN_CHECKLIST,
      travis_county: isTravis,
    };

    return {
      content: [
        { type: "text", text: formatReport(geo, sections) },
        { type: "text", text: JSON.stringify(sections, null, 2) },
      ],
    };
  },
};

/**
 * Resolve special-purpose taxing districts (MUD/PID/ESD) for a Travis address
 * via the Tax Office entity breakdown. Returns null when no account matches.
 */
async function resolveSpecialDistricts(address) {
  const matches = await searchAccounts(address, { limit: 5 });
  if (!matches.length) return null;
  const ranked = rankByAddress(matches, address);
  const detail = await getEntityDetail(ranked[0].account_id);
  const special = (detail.entities ?? []).filter((e) =>
    /MUD|PID|WCID|ESD|UTILITY DISTRICT|IMPROVEMENT DISTRICT/i.test(
      `${e.name} ${e.type}`
    )
  );
  return {
    account_id: detail.account_id,
    has_mud: detail.has_mud ?? false,
    has_pid: detail.has_pid ?? false,
    special_entities: special.map((e) => ({
      name: e.name,
      type: e.type,
      total_due: e.total_due,
    })),
  };
}

function isLikelyTravis(address, geo) {
  // Travis bounding box-ish gate: keep live Travis-only lookups from firing on
  // obvious out-of-county points. Census ZIP + a coarse lat/lng window.
  const lat = geo.lat;
  const lng = geo.lng;
  const inBox = lat > 30.0 && lat < 30.65 && lng > -98.2 && lng < -97.4;
  return inBox;
}

function rankByAddress(matches, query) {
  const tokens = (query ?? "").toUpperCase().split(/\s+/).filter((t) => t.length >= 2);
  const score = (m) => {
    if (!m.address) return 0;
    const upper = m.address.toUpperCase();
    let s = 0;
    for (const t of tokens) if (upper.includes(t)) s += 2;
    return s;
  };
  return [...matches].sort((a, b) => score(b) - score(a));
}

const MOVE_IN_CHECKLIST = [
  {
    task: "Driver license",
    detail:
      "New Texas residents must get a TX driver license within 90 days of moving. Schedule at Texas DPS (dps.texas.gov). Bring proof of residency, ID, and Social Security number.",
  },
  {
    task: "Vehicle registration & title",
    detail:
      "Register and title your vehicle within 30 days through the Travis County Tax Office (traviscountytx.gov/tax-office). A passed Texas vehicle inspection and proof of insurance are required first.",
  },
  {
    task: "Voter registration",
    detail:
      "Register or update your address with the Travis County Tax Office / VoteTexas.gov at least 30 days before any election.",
  },
  {
    task: "Homestead exemption",
    detail:
      "If you bought and live in the home, file a homestead exemption with the county appraisal district (TCAD: traviscad.org) after closing -- it lowers your property taxes and is easy to miss. No fee to file.",
  },
  {
    task: "Natural gas",
    detail:
      "Most of the Austin area is served by Texas Gas Service (texasgasservice.com) where gas is available; rural/Hill Country properties may use propane.",
  },
];

function formatReport(geo, s) {
  const lines = [
    `# Moving to ${geo.matched_address || "this address"}`,
    "",
    `_New-resident setup report. For a property-ownership / due-diligence report, use austin_property_360._`,
    "",
    "## Utilities",
  ];

  if (!s.travis_county) {
    lines.push(
      "_Water/sewer + special-district lookups currently cover Travis County only. The move-in checklist below applies statewide._"
    );
  } else if (!s.utilities) {
    lines.push("- Water/sewer provider lookup failed (transient) -- retry austin_utility_providers.");
  } else {
    lines.push(...utilityLines("Water", s.utilities.water));
    lines.push(...utilityLines("Sewer / Wastewater", s.utilities.sewer));
    lines.push("> No sewer provider listed usually means a private septic system -- confirm before closing.");
  }

  lines.push("", "## Special-District Taxes");
  if (!s.travis_county) {
    lines.push("- (Travis County only.)");
  } else if (!s.special_districts) {
    lines.push("- No Travis tax account matched, or no breakdown available.");
  } else if (s.special_districts.special_entities.length === 0) {
    lines.push("- No MUD / PID / WCID / ESD special districts found on this property.");
  } else {
    for (const e of s.special_districts.special_entities) {
      lines.push(`- **${e.name}** (${e.type})${e.total_due != null ? ` -- $${Number(e.total_due).toLocaleString("en-US")}` : ""}`);
    }
    lines.push("_Special-purpose districts can add meaningful annual cost beyond the listed tax rate._");
  }

  lines.push("", "## Districts");
  lines.push(`- **School District:** ${s.districts.school_district ?? "(outside mapped coverage)"}`);
  lines.push(`- **Voter Precinct:** ${s.districts.voter_precinct ?? "(outside Travis coverage)"}`);
  lines.push(`- **Jurisdiction:** ${s.districts.jurisdiction ? `City of Austin (full purpose)` : "Outside City of Austin full-purpose limits (ETJ or another city)"}`);

  lines.push("", "## Move-In Checklist");
  for (const item of s.move_in_checklist) {
    lines.push(`- **${item.task}:** ${item.detail}`);
  }

  lines.push(
    "",
    "---",
    `Sources: U.S. Census geocoder; PUC CCN via Travis County GIS (${UTIL_SOURCE}); Travis County Tax Office; City of Austin & Travis County ArcGIS.`,
    ATTRIBUTION_TAG
  );
  return lines.join("\n");
}

function utilityLines(label, rows) {
  if (!rows || rows.length === 0) {
    return [`- **${label}:** no certificated provider found (possible private well/septic).`];
  }
  return rows.map((p) => `- **${label}:** ${p.utility}${p.ccn_no ? ` (CCN #${p.ccn_no})` : ""}`);
}
