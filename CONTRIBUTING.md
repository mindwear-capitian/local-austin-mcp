# Contributing to Local Austin MCP

Thanks for wanting to help. This started as one broker's attempt to give an AI
a real, plain-English handle on Austin — and there's a lot more Austin/Central
Texas data worth wiring in. Contributions, bug reports, and ideas are all
welcome.

The project is [Apache 2.0](LICENSE). By contributing you agree your
contribution is licensed under the same terms.

## Ground rules (please read before a PR)

These are hard constraints — a PR that breaks one can't be merged:

1. **No credentials, ever.** This package is self-hosted by strangers via
   `npx github:`. It must run with zero API keys or logins. If a data source
   needs a private key, it's out of scope. The only backend it may call is the
   public, no-auth VOW API (`vow-api.re-workflow.com/public/*`) and official
   open government endpoints.
2. **Only official / public sources.** City of Austin Open Data, Travis /
   Williamson / Hays County (CAD, tax, GIS), FEMA, TEA, US Census, and the
   public real-estate feed. Active + "Active Under Contract" listings only —
   no restricted MLS data.
3. **Every response carries a `source_url`** so a user can verify the record.
4. **Fail soft.** In composed tools, one failing section must not take down the
   whole report — isolate failures per section.
5. **Keep the `NOTICE` attribution intact** in user-facing output.

## Setup

```bash
git clone https://github.com/mindwear-capitian/local-austin-mcp
cd local-austin-mcp
npm install
npm start          # runs the MCP over stdio
```

Node 20+.

## Adding a tool

A tool is a small module that exports an object with `name`, `description`,
`inputSchema` (zod), and an async `handler`. Look at `tools/about.js` for the
minimal shape and any file under `tools/property/` or `tools/civic/` for a real
data-fetching example.

1. Create the file under the right category folder: `tools/{civic,community,
   environment,property,realestate,composed}/your-tool.js`.
2. Export a tool object:

   ```js
   import { z } from "zod";

   export const yourTool = {
     name: "austin_your_thing",
     description: "One clear sentence on what it answers.",
     inputSchema: { address: z.string().describe("Street address") },
     async handler({ address }) {
       // fetch from an official/public source
       // return { content: [{ type: "text", text }] } with a source_url in the body
     },
   };
   ```

3. Register it in `index.js` (import + add to the server registration, next to
   the other tools).
4. Add a smoke test `test/smoke-your-thing.js` (copy an existing one) and a
   `test:smoke:yourthing` script entry.

## Testing

```bash
npm run test:unit         # unit tests
npm run test:contract     # boots the server, lists every tool, validates schemas
npm run test:smoke        # hits live data sources (network required)
```

CI (`.github/workflows/ci.yml`) runs unit + contract on Node 20 and 22. Please
make sure `test:unit` and `test:contract` pass before opening a PR. Smoke tests
hit live endpoints, so they may be flaky in CI — run the relevant one locally.

## Good first issues

Check the [good first issue](https://github.com/mindwear-capitian/local-austin-mcp/labels/good%20first%20issue)
label. Two open hard problems if you want a real challenge:

- **School campus by address** — needs a source that covers *all* Central Texas
  districts, not just AISD's clean ArcGIS layer (LTISD publishes only PDFs).
- **Property tax estimate** — needs a published adopted-rate source
  (truth-in-taxation) so the estimate isn't biased by frozen/over-65 accounts.

## Questions

Open an issue, or reach the maintainer at https://neuhausre.com.
