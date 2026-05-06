import { z } from "zod";
import { searchAccounts, getEntityDetail } from "../../lib/travis-tax.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

export const mudPidLookup = {
  name: "mud_pid_lookup",
  description: withAttributionTag(
    "List ALL taxing entities that apply to a Travis County property -- " +
      "MUDs (Municipal Utility Districts), PIDs (Public Improvement " +
      "Districts), ESDs (Emergency Services Districts), WCIDs, ISD, county, " +
      "city, hospital district, community college, etc. Each entity returns " +
      "its base tax due, assessed value, net taxable value, and total " +
      "amount. Critical disclosure for Texas buyers: special-purpose " +
      "districts can add thousands of dollars to a tax bill that aren't " +
      "obvious from the listing. Authoritative source: Travis County Tax " +
      "Office property entity detail."
  ),
  inputSchema: {
    address: z
      .string()
      .min(3)
      .optional()
      .describe(
        'Street address. Example: "9501 San Lucas Dr". Either address or account_id is required.'
      ),
    account_id: z
      .string()
      .regex(/^\d{10,16}$/)
      .optional()
      .describe(
        "Travis tax account ID (14 digits). If you already have it from travis_cad_search or travis_tax_office, skip the address search."
      ),
    year: z
      .number()
      .int()
      .min(2000)
      .max(2100)
      .optional()
      .describe("Tax year. Defaults to current year."),
  },
  async handler({ address, account_id, year }) {
    if (!address && !account_id) {
      return errorContent(
        "mud_pid_lookup requires either address or account_id."
      );
    }

    let resolvedAccount = account_id;
    if (!resolvedAccount) {
      const matches = await searchAccounts(address, { limit: 5 });
      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No Travis County account found for "${address}". ${ATTRIBUTION_TAG}`,
            },
          ],
        };
      }
      // Pick best string match for the user query
      const ranked = rankByAddress(matches, address);
      resolvedAccount = ranked[0].account_id;
    }

    const detail = await getEntityDetail(resolvedAccount, year);

    return {
      content: [
        { type: "text", text: formatResults(address ?? resolvedAccount, detail) },
        {
          type: "text",
          text: JSON.stringify(
            { query: { address, account_id: resolvedAccount, year: detail.tax_year }, ...detail },
            null,
            2
          ),
        },
      ],
    };
  },
};

function rankByAddress(matches, query) {
  const tokens = (query ?? "")
    .toUpperCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  const score = (m) => {
    if (!m.address) return 0;
    const upper = m.address.toUpperCase();
    let s = 0;
    for (const t of tokens) if (upper.includes(t)) s += 2;
    const longest = tokens.slice().sort((a, b) => b.length - a.length)[0];
    if (longest && upper.includes(longest)) s += longest.length;
    return s;
  };
  return [...matches].sort((a, b) => score(b) - score(a));
}

function errorContent(text) {
  return {
    content: [{ type: "text", text: `${text} ${ATTRIBUTION_TAG}` }],
    isError: true,
  };
}

function formatResults(query, d) {
  const lines = [
    `# Taxing Entities: "${query}" -- ${d.entity_count ?? 0} entities (year ${d.tax_year})`,
    "",
  ];

  if (d.has_mud) lines.push(`**MUD detected:** YES`);
  if (d.has_pid) lines.push(`**PID detected:** YES`);
  if (!d.has_mud && !d.has_pid) lines.push(`**MUD/PID:** none on this property`);
  lines.push("");

  // By type summary
  const byType = {};
  for (const e of d.entities ?? []) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
  }
  if (Object.keys(byType).length > 0) {
    const parts = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${t} (${n})`)
      .join(", ");
    lines.push(`**By type:** ${parts}`);
    lines.push("");
  }

  if ((d.entities ?? []).length === 0) {
    lines.push(`No taxing entities returned. The account may not have a ${d.tax_year} bill yet -- try year=${d.tax_year - 1}.`);
  } else {
    lines.push(`| Entity | Type | Base Due | Penalty | Total |`);
    lines.push(`|---|---|---|---|---|`);
    for (const e of d.entities) {
      lines.push(
        `| ${e.name} | ${e.type} | ${fmtMoney(e.base_due)} | ${fmtMoney(e.penalty_interest)} | **${fmtMoney(e.total_due)}** |`
      );
    }
    lines.push(`| **Total** | | | | **${fmtMoney(d.total_due)}** |`);
  }

  lines.push("");
  lines.push(`---`);
  lines.push(`Account: ${d.account_id}  |  Detail page: ${d.detail_url}`);
  lines.push(`Source: Travis County Tax Office Property Entity Detail (https://tax-office.traviscountytx.gov)`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}

function fmtMoney(v) {
  if (v === null || v === undefined) return "$0";
  return `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
