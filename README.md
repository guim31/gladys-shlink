# Shlink for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that brings the visits of the short links of your self-hosted
[Shlink](https://shlink.io/) server into Gladys.

- **The Shlink server as a device**: reachable or not, number of short links,
  visits in all and today, bot visits today.
- **One device per short link you follow**: visits in all and today, date and
  time of the last visit (bots excluded).
- **Scene triggers**: a new visit on a followed link (with the country and the
  referring site when Shlink knows them, bots excluded by default), Shlink
  unreachable, Shlink reachable again.
- **Scene action**: read a short link, with a ready-made sentence for a
  message.
- **Dashboard widget**: the visits of the day and the most visited links.
- Texts in English, French, German and Spanish.

Tested against a real self-hosted Shlink 5.1.8 (Docker, SQLite), with real
visits from browser and bot User-Agents, on two domains. Feedback welcome on
[the issues](https://github.com/guim31/gladys-shlink/issues).

## Requirements

- Gladys Assistant 5.1.0 or later.
- A Shlink server (3.0 or later, REST API v3) reachable from Gladys, and an API
  key (`shlink api-key:generate`).

## Installation

In Gladys, open **Integrations → Install from GitHub** and enter
`https://github.com/guim31/gladys-shlink`. Then open its configuration, enter
the address of your Shlink server and the API key, and add the server and the
links to follow from the Discover tab.

The full guide: [docs/en.md](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)).

## How it works

At the chosen interval (one minute by default), the container reads
`GET /rest/v3/visits`, the visits of the day with and without bots
(`/rest/v3/visits/non-orphan?startDate=…`), the ten most visited links, and for
each link added to Gladys its newest visits and its visits of the day
(`/rest/v3/short-urls/{code}/visits`). The whole link list is read every 10
minutes. It publishes the states of the added devices when they change and
fires the scene events. Shlink dates visits to the second without an id: the
newest visit seen per link is kept in `/data`, so a restart announces nothing
twice. Redirects are not followed, so the API key is never sent to another
host. The logs never hold visitor data.

## Limits

- Read-only, one Shlink server per configuration.
- Up to 20 new visits per link and refresh are announced; the link list is
  capped at 2,000 links, 200 of them proposed in Discover (the most visited).
- A self-signed HTTPS certificate is not accepted (use `http://` on the local
  network). The country of a visit needs a GeoLite2 key on the Shlink side.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

See [CLAUDE.md](CLAUDE.md) for the project rules and the notes on the Shlink
API.

## Credits

- [Shlink](https://github.com/shlinkio/shlink) by Alejandro Celaya and
  contributors (MIT): the API answers in `test/fixtures/shlink` come from its
  Docker image, and the logo of the cover from its
  [brand assets](https://github.com/shlinkio/shlink.io).
- Built from the official
  [Gladys integration template](https://github.com/GladysAssistant/integration-template-js)
  and on the architecture of
  [gladys-umami](https://github.com/guim31/gladys-umami).

Not affiliated with Shlink or its authors.

## License

Apache-2.0, see [LICENSE](LICENSE).
