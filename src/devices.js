// -----------------------------------------------------------------------------
// Gladys devices, proposed in the Discovery tab (the user adds what to follow,
// nothing is created on their behalf):
//
// The Shlink server (one per integration):
//   reachable         presence-sensor/binary   1 when Shlink answers
//   links             counter-sensor/integer   short links the key sees
//   visits            counter-sensor/integer   link visits, bots excluded
//   visits_today      counter-sensor/integer   link visits today, bots excluded
//   bot_visits_today  counter-sensor/integer   link visits today flagged as bots
//
// One device per short link, identified by its domain and short code (what
// Shlink itself uses: the same code may exist on two domains):
//   visits            counter-sensor/integer   visits, bots excluded
//   visits_today      counter-sensor/integer   visits today, bots excluded
//   last_visit        text/text                local date and time of the last
//                                              visit, "-" before the first one
//
// "Today" starts at midnight in the time zone of Gladys (the supervisor
// injects TZ). Published with should_poll: false: the integration reads
// Shlink on its own timer (src/hub.js), at the interval of the configuration.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

export const SERVER_TYPE = 'server';
export const SERVER_ID = 'shlink';
export const LINK_TYPE = 'link';
export const MODEL = 'Shlink';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  REACHABLE: 'reachable',
  LINKS: 'links',
  VISITS: 'visits',
  VISITS_TODAY: 'visits_today',
  BOT_VISITS_TODAY: 'bot_visits_today',
  LAST_VISIT: 'last_visit',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.REACHABLE]: 'Reachable',
    [FEATURE_KEYS.LINKS]: 'Short links',
    [FEATURE_KEYS.VISITS]: 'Visits',
    [FEATURE_KEYS.VISITS_TODAY]: 'Visits today',
    [FEATURE_KEYS.BOT_VISITS_TODAY]: 'Bot visits today',
    [FEATURE_KEYS.LAST_VISIT]: 'Last visit',
  },
  fr: {
    [FEATURE_KEYS.REACHABLE]: 'Joignable',
    [FEATURE_KEYS.LINKS]: 'Liens courts',
    [FEATURE_KEYS.VISITS]: 'Visites',
    [FEATURE_KEYS.VISITS_TODAY]: "Visites aujourd'hui",
    [FEATURE_KEYS.BOT_VISITS_TODAY]: "Visites de robots aujourd'hui",
    [FEATURE_KEYS.LAST_VISIT]: 'Dernière visite',
  },
  de: {
    [FEATURE_KEYS.REACHABLE]: 'Erreichbar',
    [FEATURE_KEYS.LINKS]: 'Kurzlinks',
    [FEATURE_KEYS.VISITS]: 'Besuche',
    [FEATURE_KEYS.VISITS_TODAY]: 'Besuche heute',
    [FEATURE_KEYS.BOT_VISITS_TODAY]: 'Bot-Besuche heute',
    [FEATURE_KEYS.LAST_VISIT]: 'Letzter Besuch',
  },
  es: {
    [FEATURE_KEYS.REACHABLE]: 'Accesible',
    [FEATURE_KEYS.LINKS]: 'Enlaces cortos',
    [FEATURE_KEYS.VISITS]: 'Visitas',
    [FEATURE_KEYS.VISITS_TODAY]: 'Visitas hoy',
    [FEATURE_KEYS.BOT_VISITS_TODAY]: 'Visitas de robots hoy',
    [FEATURE_KEYS.LAST_VISIT]: 'Última visita',
  },
};

// Display bounds (the core never applies them on write).
export const MAX_LINKS = 10_000_000;
export const MAX_DAILY = 1_000_000_000;
export const MAX_TOTAL = 1_000_000_000_000;

export const serverIds = (gladys) => gladys.externalIds(SERVER_TYPE, SERVER_ID);

/** The platform id of a link: its domain ('_' for the default one) and its code. */
export const linkKey = (link) => `${link.domain ?? '_'}/${encodeURIComponent(link.code)}`;

export const linkIds = (gladys, link) => gladys.externalIds(LINK_TYPE, linkKey(link));

/** The link key of a device external id, null when it is not a link of ours. */
export function parseLinkKey(gladys, externalId) {
  const prefix = gladys.externalIds(LINK_TYPE, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const key = externalId.slice(prefix.length);
  // The domain may hold a port; the code is URI-encoded (no `/`).
  return /^[^/]+\/[^/]+$/.test(key) ? key : null;
}

/** What a person reads for a link: its title, or its short address. */
export const linkLabel = (link) =>
  link.title || link.shortUrl.replace(/^https?:\/\//, '') || link.code;

const sensor = (name, externalId, category, type, extra) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: true,
  has_feedback: false,
  ...extra,
});

const counter = (name, externalId, max) =>
  sensor(
    name,
    externalId,
    DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    { keep_history: true, min: 0, max },
  );

/** The discovery payload of the server. */
export function buildServerDevice(gladys, host, language = 'en') {
  const ids = serverIds(gladys);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: `Shlink ${host}`.slice(0, 255),
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    params: [],
    features: [
      sensor(
        names[FEATURE_KEYS.REACHABLE],
        ids.feature(FEATURE_KEYS.REACHABLE),
        DEVICE_FEATURE_CATEGORIES.PRESENCE_SENSOR,
        DEVICE_FEATURE_TYPES.SENSOR.BINARY,
        { keep_history: true, min: 0, max: 1 },
      ),
      counter(names[FEATURE_KEYS.LINKS], ids.feature(FEATURE_KEYS.LINKS), MAX_LINKS),
      counter(names[FEATURE_KEYS.VISITS], ids.feature(FEATURE_KEYS.VISITS), MAX_TOTAL),
      counter(names[FEATURE_KEYS.VISITS_TODAY], ids.feature(FEATURE_KEYS.VISITS_TODAY), MAX_DAILY),
      counter(
        names[FEATURE_KEYS.BOT_VISITS_TODAY],
        ids.feature(FEATURE_KEYS.BOT_VISITS_TODAY),
        MAX_DAILY,
      ),
    ],
  };
}

/** The discovery payload of a link. */
export function buildLinkDevice(gladys, link, language = 'en') {
  const ids = linkIds(gladys, link);
  const names = NAMES[language] ?? NAMES.en;
  const params = [];
  if (link.shortUrl) {
    params.push({ name: 'SHORT_URL', value: link.shortUrl.slice(0, 255) });
  }
  if (link.longUrl) {
    params.push({ name: 'LONG_URL', value: link.longUrl.slice(0, 255) });
  }
  return {
    name: linkLabel(link).slice(0, 255),
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    params,
    features: [
      counter(names[FEATURE_KEYS.VISITS], ids.feature(FEATURE_KEYS.VISITS), MAX_TOTAL),
      counter(names[FEATURE_KEYS.VISITS_TODAY], ids.feature(FEATURE_KEYS.VISITS_TODAY), MAX_DAILY),
      sensor(
        names[FEATURE_KEYS.LAST_VISIT],
        ids.feature(FEATURE_KEYS.LAST_VISIT),
        DEVICE_FEATURE_CATEGORIES.TEXT,
        DEVICE_FEATURE_TYPES.TEXT.TEXT,
        { keep_history: false, min: 0, max: 0 },
      ),
    ],
  };
}

/** A local date and time, `YYYY-MM-DD HH:mm` (the time zone of Gladys). */
export function localDateTime(time) {
  const date = new Date(time);
  const two = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ` +
    `${two(date.getHours())}:${two(date.getMinutes())}`
  );
}

/** The last visit as a feature text: never empty. */
export const lastVisitText = (link) => (link.lastVisitAt ? localDateTime(link.lastVisitAt) : '-');

const withIds = (ids, values) =>
  values.map(({ key, ...value }) => ({ device_feature_external_id: ids.feature(key), ...value }));

/** The states of the server, `reachable` alone when Shlink does not answer. */
export function serverValues(gladys, server, reachable) {
  const values = [{ key: FEATURE_KEYS.REACHABLE, state: reachable ? 1 : 0 }];
  if (reachable && server) {
    values.push(
      { key: FEATURE_KEYS.LINKS, state: server.links },
      { key: FEATURE_KEYS.VISITS, state: server.visits },
      { key: FEATURE_KEYS.VISITS_TODAY, state: server.visitsToday },
      { key: FEATURE_KEYS.BOT_VISITS_TODAY, state: server.botsToday },
    );
  }
  return withIds(serverIds(gladys), values);
}

/** The states of a link, nothing for the values not read yet. */
export function linkValues(gladys, link) {
  const values = [{ key: FEATURE_KEYS.VISITS, state: link.visits }];
  if (link.today !== null && link.today !== undefined) {
    values.push(
      { key: FEATURE_KEYS.VISITS_TODAY, state: link.today },
      { key: FEATURE_KEYS.LAST_VISIT, text: lastVisitText(link) },
    );
  }
  return withIds(linkIds(gladys, link), values);
}
