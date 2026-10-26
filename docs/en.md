# Shlink

[Shlink](https://shlink.io/) is a self-hosted URL shortener, open source (MIT),
with a REST API. This integration brings the visits of your short links into
Gladys: the Shlink server becomes a device (reachable or not, number of links,
visits in all and today, bot visits today), and each short link you choose
becomes a device with its visits in all, its visits today and the date of its
last visit. Scenes can react to each new visit of a link (with the country and
the referring site when Shlink knows them), and to Shlink going down or coming
back; a dashboard widget lists the most visited links, and a scene action puts
the figures of a link in a message.

Tested against a real self-hosted Shlink 5.1.8 (Docker, SQLite), with real
visits; feedback welcome on
[the issues](https://github.com/guim31/gladys-shlink/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- A Shlink server (version 3.0 or later, for the REST API v3), reachable from
  the Gladys machine.
- An **API key** of this server.

At each refresh the integration sends four requests (visit totals, visits of
the day with and without bots, the ten most visited links), plus two per link
added to Gladys (three when the bots fire scenes), and reads the whole link
list every 10 minutes. Gladys accepts 300 states per minute: with the 30-second
interval, add 40 links at most to Gladys.

## Getting started

### 1. Create an API key

On the Shlink server, run `shlink api-key:generate` (with Docker:
`docker exec -it <container> shlink api-key:generate`) and copy the key. A key
limited to one domain or to the links of its author (Shlink roles) works too:
the integration then sees only those links.

### 2. Configure the integration

In Gladys, open **Integrations → Shlink → Configuration**:

- **Shlink address**: the address of your server, the one your short links
  use, for example `http://192.168.1.10:8080` or `https://s.example.org`. An
  address copied with `/rest/...` is understood.
- **API key**: the key of step 1.
- **Refresh interval**: from 30 seconds to 5 minutes (1 minute by default).
- **Bot visits fire "New visit"**: off by default. Shlink flags as bots the
  crawlers and link previews (messaging apps, social networks); the figures
  never count them.
- **Language of the names**: the language of the feature names, set when a
  device is added, and of the scene results.

**Test the connection** reads Shlink and answers with the version, the number
of links and the visits of the day.

### 3. Add the server and the links

Open the **Discover** tab of the integration: it lists the Shlink server and
your short links, the most visited first (the 200 first ones). Add the server,
and the links you want to follow: only the added links are read one by one and
fire "New visit".

## The devices

The Shlink server:

| Feature          | What it shows                                                 |
| ---------------- | ------------------------------------------------------------- |
| Reachable        | 1 when Shlink answers, 0 after two failed reads in a row      |
| Short links      | the short links the API key sees                              |
| Visits           | the visits of every link since Shlink counts, bots excluded   |
| Visits today     | the visits of every link today (from midnight), bots excluded |
| Bot visits today | the visits of today that Shlink flags as bots                 |

Each added short link:

| Feature      | What it shows                                                                       |
| ------------ | ----------------------------------------------------------------------------------- |
| Visits       | the visits of the link, bots excluded                                               |
| Visits today | the visits of the link today (from midnight), bots excluded                         |
| Last visit   | the local date and time of the last visit (bots excluded), `-` before the first one |

The same short code on two domains makes two different links. "Today" starts at
midnight in the time zone of Gladys.

## Dashboard

The **Shlink links** widget shows the visits of today, the visits in all and the
number of links, then the ten most visited links with their visits (and the
visits of today for the links added to Gladys). The **Refresh** button reads
Shlink again.

## Scenes

### Triggers

- **New visit**: a short link added to Gladys is visited. Choose the links (empty:
  any). Variables: link name, short address, target address, country and
  country code (empty when Shlink does not locate visits), referring site (its
  host only, empty when none), visits today, bot (1) or not (0). Bots fire it
  only with the option of the configuration. Up to 20 new visits per link and
  refresh are announced: more are counted, not announced.
- **Shlink unreachable**: Shlink no longer answers, after two failed reads in a
  row (a refused API key is not an outage). Variable: server address.
- **Shlink reachable again**: Shlink answers again. Variables: server address,
  outage in minutes.

### Actions

- **Read a short link**: reads the figures of a link for the next actions: name,
  short address, target address, visits, visits today, last visit, and a
  ready-made sentence such as "Newsletter: 12 visit(s) today, 340 in all, last
  visit 2026-10-26 17:05.".

### Scene ideas

- A notification when someone opens the link of your CV or of a listing:
  trigger **New visit** on this link, then a message with the country and the
  referring site.
- Every evening at 9 pm, **Read a short link** on the link of your newsletter,
  then send its sentence by Telegram.
- A warning when your link shortener is down: trigger **Shlink unreachable**,
  message to the administrator; and **Shlink reachable again** with the outage
  duration.

## Troubleshooting

- **"Shlink does not answer"**: check the address and that Gladys can reach the
  server (same network, firewall, port).
- **"API key refused"**: the key was deleted or disabled, or has expired: create
  a new one with `shlink api-key:generate`.
- **"no Shlink API at this address"**: the address points to something else (a
  web client such as app.shlink.io, a reverse proxy page): use the address of
  the short links.
- **"the address redirects"**: enter the `https://` address directly.
- **"certificate refused"**: the HTTPS certificate is self-signed or expired: use
  the `http://` address on your local network, or a trusted certificate.
- **No country in "New visit"**: Shlink locates visits only with a GeoLite2
  license key (`GEOLITE_LICENSE_KEY`).
- The logs never show who visited: no address, no country, no referring site.

## Limits

- Shlink only (REST API v3, Shlink 3.0 or later); orphan visits (base URL,
  invalid links) are not counted.
- Shlink dates visits to the second and gives them no identifier: the
  integration announces each new visit once by remembering the newest one seen,
  in `/data`. After a long stop, only the 20 newest visits of each link are
  announced.
- A link is read one by one only once added to Gladys; the whole list is read
  again every 10 minutes (a new link appears in Discover within 10 minutes, or
  at once with a search).
- The integration reads Shlink, it never creates nor changes a link.
