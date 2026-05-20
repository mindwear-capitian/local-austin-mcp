# Local Austin MCP -- Geographic Coverage

## Counties covered for property data (CAD)

| County | CAD tool | ZIP examples | Cities |
|---|---|---|---|
| Travis | `austin_travis_cad` | 787xx core | Austin, Lakeway, Bee Cave, West Lake Hills, Rollingwood, Sunset Valley, Lago Vista, Volente, Jonestown, Manor, Del Valle, Pflugerville (split) |
| Williamson | `austin_williamson_cad` | 78613, 786xx | Cedar Park, Round Rock, Leander, Georgetown, Hutto, Taylor, Liberty Hill, Florence, Jarrell |
| Hays | `austin_hays_cad` | 78610, 78620, 78640, 78666 | Buda, Kyle, San Marcos, Dripping Springs, Wimberley, Driftwood |

`austin_property_360` auto-routes by ZIP/city. Ambiguous addresses fan out across all three CADs in parallel and prefer the first match (Travis > Williamson > Hays).

## City-of-Austin-jurisdiction tools

The following tools only return data inside the City of Austin proper. Lakeway, Bee Cave, West Lake Hills, Rollingwood, Sunset Valley, Lago Vista, Volente, Jonestown, Manor, Del Valle, and Pflugerville are explicitly skipped:

- `austin_permits`
- `austin_code_cases`
- `austin_zoning`
- `austin_311`

The composed `austin_property_360` tool detects whether an address is in the city limits before firing these and shows a `skipped` reason when not.

## Tax / entity tools

`austin_travis_tax` and `austin_mud_pid` only cover Travis County. There is no equivalent tool for Williamson or Hays yet -- check directly with those tax offices.

## Real estate tools

Listings cover the Austin MSA: Travis, Williamson, Hays, Bastrop, Caldwell, Burnet, Blanco. The VOW free tier returns ACTIVE and "Active Under Contract" only.
