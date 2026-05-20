/**
 * MCP Prompts for Local Austin MCP.
 *
 * Prompts are templates the server offers to MCP clients. Clients surface
 * them as one-click flows / slash commands. Each prompt renders a chat
 * message (or message list) the LLM can act on -- usually a recipe that
 * chains several of this server's tools.
 *
 * Conventions:
 *  - Each prompt has a stable `name`, zero or more typed arguments, and a
 *    `messages` factory that returns the rendered conversation.
 *  - Keep templates short and instructive: they tell the LLM what tools to
 *    call in what order, and what to summarize.
 *  - Bias toward `austin_property_360` for address queries so we get
 *    one-shot fan-out.
 */

import { z } from "zod";

export function registerPrompts(server) {
  // ---- investigate_property -------------------------------------------------
  server.registerPrompt(
    "investigate_property",
    {
      title: "Investigate an Austin-area property",
      description:
        "Run a one-shot austin_property_360 report on an address, then narrate " +
        "the key risks and selling points.",
      argsSchema: {
        address: z
          .string()
          .min(3)
          .describe('Full street address. Example: "9501 San Lucas Dr, Austin, TX 78737"'),
      },
    },
    ({ address }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Investigate the property at "${address}".\n\n` +
              `Steps:\n` +
              `1. Call \`austin_property_360\` with that address.\n` +
              `2. Summarize: owner, market value, year built, sqft, school district, ` +
              `subdivision, council district, ANY flood-zone exposure, ANY active code ` +
              `cases, total tax balance, MUD/PID presence, recent permits.\n` +
              `3. Flag risks: prior-year tax balance, in-SFHA flood zone, open code cases, ` +
              `repeat 311 issues, missing CAD record.\n` +
              `4. Note if it is currently listed for sale on MLS (active or under contract).\n` +
              `5. End with a one-paragraph "bottom line" for a buyer.`,
          },
        },
      ],
    })
  );

  // ---- compare_addresses ----------------------------------------------------
  server.registerPrompt(
    "compare_addresses",
    {
      title: "Compare two Austin-area addresses",
      description:
        "Pull austin_property_360 on both addresses in parallel, then build a " +
        "side-by-side comparison table.",
      argsSchema: {
        address_a: z.string().min(3).describe("First address."),
        address_b: z.string().min(3).describe("Second address."),
      },
    },
    ({ address_a, address_b }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Compare these two properties:\n  A. ${address_a}\n  B. ${address_b}\n\n` +
              `Steps:\n` +
              `1. Call \`austin_property_360\` ONCE for each address (in parallel where possible).\n` +
              `2. Build a markdown comparison table with rows: Market value, Year built, ` +
              `Sqft, Lot size, School district, Subdivision, FEMA flood zone, ` +
              `Open code cases (count), 311 requests (count last 2y), Permits (count, last 5y), ` +
              `Tax balance, MUD/PID present, Currently listed (Y/N + price).\n` +
              `3. Below the table, write 3-5 bullets on the DIFFERENCES that would matter ` +
              `most to a buyer choosing between them.`,
          },
        },
      ],
    })
  );

  // ---- neighborhood_brief ---------------------------------------------------
  server.registerPrompt(
    "neighborhood_brief",
    {
      title: "Neighborhood brief for an Austin ZIP",
      description:
        "Pull active MLS inventory, recent 311 hotspots, code cases, and " +
        "school ratings for a ZIP code; write a buyer-facing brief.",
      argsSchema: {
        zip: z
          .string()
          .regex(/^\d{5}$/)
          .describe('5-digit ZIP code in the Austin MSA. Example: "78737"'),
      },
    },
    ({ zip }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Write a buyer-facing neighborhood brief for ZIP ${zip}.\n\n` +
              `Steps:\n` +
              `1. Call \`austin_active_listings\` with zip=${zip} sort=newest limit=10 ` +
              `for current inventory.\n` +
              `2. Call \`austin_neighborhood_lookup\` with the ZIP to get school district, ` +
              `subdivision-family list, and any other on-file metadata.\n` +
              `3. If the ZIP is in the City of Austin, optionally call \`austin_311\` ` +
              `(request_type="pothole", since_year recent) for quality-of-life signal.\n` +
              `4. Synthesize: price range, typical home (bd/ba/sqft), school district, ` +
              `top subdivisions, what kind of buyer this ZIP fits.`,
          },
        },
      ],
    })
  );

  // ---- school_lookup --------------------------------------------------------
  server.registerPrompt(
    "school_lookup",
    {
      title: "Look up a Texas school",
      description:
        "Look up a campus by name (and optional district) and summarize its " +
        "TEA accountability rating, demographics, and basic facts.",
      argsSchema: {
        campus_name: z.string().min(2).describe('School / campus name fragment.'),
        district: z.string().optional().describe('District name fragment (optional, narrows results).'),
      },
    },
    ({ campus_name, district }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Look up Texas school "${campus_name}"${district ? ` in ${district} ISD` : ""}.\n\n` +
              `Steps:\n` +
              `1. Call \`austin_tea_schools\` with campus="${campus_name}"` +
              (district ? `, district="${district}"` : "") + `.\n` +
              `2. For the top match, report: campus + district, school type (Elem/Middle/HS), ` +
              `overall A-F rating, overall score, county, and a 1-line plain-English summary.\n` +
              `3. If multiple matches, list all then drill into the highest-rated one.`,
          },
        },
      ],
    })
  );

  // ---- health_check ---------------------------------------------------------
  server.registerPrompt(
    "health_check",
    {
      title: "Are the upstream data sources healthy?",
      description:
        "Run austin_health and explain which providers are up, degraded, or " +
        "down, and what that means for the user's next move.",
      argsSchema: {},
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Call \`austin_health\` and summarize:\n\n` +
              `- How many providers are OK / degraded / down.\n` +
              `- Specifically WHICH providers are degraded or down (by name).\n` +
              `- For each degraded / down: which tools depend on it.\n` +
              `- Recommendation: which queries to retry vs route around.`,
          },
        },
      ],
    })
  );
}
