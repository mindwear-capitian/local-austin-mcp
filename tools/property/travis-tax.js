import { z } from "zod";
import { searchAccounts, getAccountDetail } from "../../lib/travis-tax.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

export const travisTax = {
  name: "travis_tax_office",
  description: withAttributionTag(
    "Look up the current property tax status from the Travis County Tax " +
      "Office for an address. Returns owner, mailing address, account ID, " +
      "current tax year levy + balance, prior-year delinquencies, and total " +
      "amount due. Useful for verifying tax-current status before closing, " +
      "spotting delinquent owners (potential motivated sellers), or " +
      "confirming the actual tax bill on a listing. Authoritative source: " +
      "Travis County Tax Office."
  ),
  inputSchema: {
    address: z
      .string()
      .min(3)
      .optional()
      .describe(
        'Street address. Example: "9501 San Lucas Dr". Returns top match by default. Either address or account_id is required.'
      ),
    account_id: z
      .string()
      .regex(/^\d{10,16}$/)
      .optional()
      .describe(
        "Travis tax account ID (14 digits, e.g. '04125304130000'). If you already have it from travis_cad_search (geo_id + '0000') skip the address search."
      ),
    all_matches: z
      .boolean()
      .optional()
      .describe(
        "If true, return detail for every search match (slower). Default false = top match only."
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Max search matches to consider (default 5)."),
  },
  async handler({ address, account_id, all_matches, limit }) {
    if (!address && !account_id) {
      return errorContent(
        "travis_tax_office requires either an address or an account_id."
      );
    }

    let accounts;
    if (account_id) {
      accounts = [{ account_id, address: null, detail_url: null }];
    } else {
      const matches = await searchAccounts(address, { limit: limit ?? 5 });
      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text",
              text:
                `No Travis County tax account found for "${address}". Try a ` +
                `simpler query (street + number, no city/zip), or verify the ` +
                `address is in Travis County. ${ATTRIBUTION_TAG}`,
            },
          ],
        };
      }
      // Heuristic upstream search returns fuzzy matches across street names
      // (e.g. searching "9501 san lucas" returns 9501 SAN DIEGO + SAN LUCAS +
      // SANDSTONE). Re-rank by how well each match's address matches the
      // user's input.
      const ranked = rankByAddressMatch(matches, address);
      accounts = all_matches ? ranked : ranked.slice(0, 1);
    }

    const details = await Promise.all(
      accounts.map((a) => getAccountDetail(a.account_id))
    );

    return {
      content: [
        { type: "text", text: formatResults(address ?? account_id, details) },
        {
          type: "text",
          text: JSON.stringify(
            { query: address ?? account_id, count: details.length, results: details },
            null,
            2
          ),
        },
      ],
    };
  },
};

function rankByAddressMatch(matches, query) {
  const qTokens = (query ?? "")
    .toUpperCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  return [...matches].sort((a, b) => scoreAddr(b, qTokens) - scoreAddr(a, qTokens));
}

function scoreAddr(m, qTokens) {
  if (!m.address) return 0;
  const upper = m.address.toUpperCase();
  let score = 0;
  for (const t of qTokens) if (upper.includes(t)) score += 2;
  // Bonus for exact substring of the longest token
  const longest = qTokens.slice().sort((a, b) => b.length - a.length)[0];
  if (longest && upper.includes(longest)) score += longest.length;
  return score;
}

function errorContent(text) {
  return {
    content: [{ type: "text", text: `${text} ${ATTRIBUTION_TAG}` }],
    isError: true,
  };
}

function formatResults(query, details) {
  const lines = [
    `# Travis Tax Office: "${query}" -- ${details.length} account${details.length === 1 ? "" : "s"}`,
    "",
  ];

  for (const d of details) {
    lines.push(`## Account ${d.account_id}`);
    if (d.owner) lines.push(`- **Owner:** ${d.owner}`);
    if (d.mailing_address) lines.push(`- **Mailing:** ${d.mailing_address}`);
    if (d.legal_description) lines.push(`- **Legal:** ${d.legal_description}`);

    if (d.current_year_due && d.current_tax_year) {
      const c = d.current_year_due;
      lines.push(
        `- **${d.current_tax_year} Tax Year:** Base ${fmtMoney(c.base_due)} | ` +
          `Penalty ${fmtMoney(c.penalty_interest)} | Fees ${fmtMoney(c.attorney_other_fees)} | ` +
          `**Total ${fmtMoney(c.total_due)}**`
      );
    }
    if (d.prior_years_due && d.prior_years_due.total_due > 0) {
      const p = d.prior_years_due;
      lines.push(
        `- **Prior years delinquent:** Base ${fmtMoney(p.base_due)} | ` +
          `Penalty ${fmtMoney(p.penalty_interest)} | Fees ${fmtMoney(p.attorney_other_fees)} | ` +
          `**Total ${fmtMoney(p.total_due)}**`
      );
    }
    lines.push(`- **TOTAL DUE:** ${fmtMoney(d.total_due)}`);
    lines.push(`- **Delinquent:** ${d.is_delinquent ? "YES (prior years owed)" : "No"}`);
    if (d.detail_url) lines.push(`- **Detail page:** ${d.detail_url}`);
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`Source: Travis County Tax Office (https://tax-office.traviscountytx.gov)`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}

function fmtMoney(v) {
  if (v === null || v === undefined) return "$0";
  return `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
