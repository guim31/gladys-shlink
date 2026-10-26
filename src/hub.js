// -----------------------------------------------------------------------------
// The Shlink hub: Shlink read on a timer of the container (the interval chosen
// in the configuration); the states of the added devices published when they
// change, the scene events fired on transitions, and the views the widget and
// the scene action read.
//
// Gladys never polls these devices (should_poll: false): the interval goes up
// to 5 minutes, beyond the fixed list of the core scheduler.
//
// Requests per cycle: the visit totals, the visits of today (with and without
// bots), the ten most visited links; then two per link added to Gladys (its
// newest visits without bots, and its visits of today), three with the bots
// in the triggers. The whole link list is read every 10 minutes.
//
// What the triggers remember is kept in /data (src/store.js): a restart
// neither announces a visit twice nor misses one (within the 20 newest), nor
// announces the server back when it never went away.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import {
  buildLinkDevice,
  buildServerDevice,
  linkIds,
  linkKey,
  linkLabel,
  linkValues,
  parseLinkKey,
  serverIds,
  serverValues,
} from './devices.js';
import { ERROR_KINDS, ShlinkClient, ShlinkError } from './shlink/client.js';
import { hostOf, missingCredentials, normalizeConfig } from './config.js';
import { ProblemLog } from './problems.js';
import { CONNECTION_TEXT, ERROR_TEXT, REPORT_TEXT, labelled, pick } from './texts.js';

const logger = createLogger({ name: 'shlink-hub' });

export const WIDGET_KEY = 'shlink_top_links';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  NEW_VISIT: 'new_visit',
  UNREACHABLE: 'server_unreachable',
  BACK: 'server_back',
});

export const HUB_TIMINGS = {
  // The whole link list (added, renamed, deleted links).
  linksEveryMs: 10 * 60_000,
  // An unchanged value is sent again this often: Gladys shows "no recent
  // value" after 48 hours.
  heartbeatMs: 12 * 3600_000,
  // A scene action reads Shlink again when the last read is older.
  freshMs: 15_000,
};

// Failed reads in a row before the server counts as unreachable: one lost
// answer is not an outage.
export const FAILURES_FOR_DOWN = 2;
// The newest visits read per link and cycle: more new visits than this
// between two reads are counted, not all announced.
export const VISITS_PER_READ = 20;
// The links of the widget and of the quick read of every cycle.
export const TOP_LINKS = 10;
// Links proposed in the Discovery tab, most visited first (the added ones
// always are).
export const MAX_DISCOVERED = 200;

// Errors that mean Shlink cannot be reached (the others are a configuration
// to fix: key refused, redirect).
const DOWN_KINDS = new Set([
  ERROR_KINDS.UNREACHABLE,
  ERROR_KINDS.TLS,
  ERROR_KINDS.NOT_SHLINK,
  ERROR_KINDS.HTTP,
]);

const MAX_TRANSPORTS_PER_REQUEST = 100;

/** Midnight of the day of `time`, in the time zone of Gladys (TZ). */
export function startOfDay(time) {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * The visits of `items` (newest first) not seen yet, oldest first, and what
 * to remember: the date of the newest visit and how many share it (Shlink
 * dates are to the second and visits have no id).
 */
export function newVisits(items, seen) {
  if (items.length === 0) {
    return { fresh: [], seen: seen ?? { at: 0, count: 0 } };
  }
  const newest = items[0].at;
  const next = { at: newest, count: items.filter((visit) => visit.at === newest).length };
  if (!seen) {
    return { fresh: [], seen: next };
  }
  const fresh = items.filter((visit) => visit.at > seen.at);
  // Newest first within a second too (Shlink orders by id): the ones seen
  // are at the end.
  const same = items.filter((visit) => visit.at === seen.at);
  fresh.push(...same.slice(0, Math.max(0, same.length - seen.count)));
  return { fresh: fresh.reverse(), seen: next };
}

export class ShlinkHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/shlink/client.js)
   * @param {boolean} [options.timers] the reading timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    // Defaults until start(): a handler reached after a failed start still
    // answers with a readable message.
    this.config = normalizeConfig({});
    this.client = null;
    this.signature = null;
    this.version = '';
    /** @type {{ links: number, visits: number, bots: number, visitsToday: number, botsToday: number }|null} */
    this.server = null;
    /** @type {Map<string, object>} links of the last list, by link key */
    this.links = new Map();
    /** @type {string[]} keys of the most visited links, most visited first */
    this.top = [];
    this.linksAt = 0;
    this.readAt = 0;
    this.error = null;
    this.failures = 0;
    this.polling = null;
    this.transports = new Map();
    this.connection = null;
    this.discovered = null;
    this.saved = { links: {} };
    this.pollTimer = null;
    this.stopped = false;
    // What fails again at every cycle (Gladys refusing, the reading loop):
    // one line when it starts, one when it ends.
    this.problems = new ProblemLog(logger);
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    const links = saved?.links;
    this.saved = {
      links: links && typeof links === 'object' ? links : {},
      reachable: typeof saved?.reachable === 'boolean' ? saved.reachable : undefined,
      downSince: Number.isFinite(saved?.downSince) ? saved.downSince : undefined,
    };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.transports.clear();
    this.connection = null;
    this.discovered = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const previous = this.config;
    const languageChanged = this.signature !== null && previous.language !== config.language;
    this.config = config;
    const signature = JSON.stringify([config.url, config.apiKey]);
    const serverChanged =
      this.signature !== null && JSON.stringify([previous.url]) !== JSON.stringify([config.url]);
    if (serverChanged || (this.signature !== null && previous.includeBots !== config.includeBots)) {
      // Another server, or other visits watched: start again without
      // announcing the past visits.
      this.saved.links = {};
    }
    if (serverChanged) {
      // An outage of the previous address (a typo, often) is not one of this server.
      delete this.saved.reachable;
      delete this.saved.downSince;
    }
    if (signature !== this.signature) {
      this.signature = signature;
      this.client =
        missingCredentials(config) === null
          ? new ShlinkClient({ url: config.url, apiKey: config.apiKey, request: this.request })
          : null;
      this.server = null;
      this.links = new Map();
      this.top = [];
      this.version = '';
      this.linksAt = 0;
      this.readAt = 0;
      this.error = null;
      this.failures = 0;
      this.polling = null;
    }
    if (languageChanged) {
      this.discovered = null; // new names for the Discovery tab
    }
    try {
      if (this.client) {
        await this.pollNow({ publish: true });
      } else {
        await this.afterChanges(true, { publish: true });
      }
    } finally {
      this.schedulePoll();
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    await this.store.flush();
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollNow();
        this.problems.recover('poll', 'Reading Shlink works again');
      } catch (err) {
        this.problems.fail('poll', `Poll failed: ${err.message}`, 'error');
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  // --- Reading Shlink ------------------------------------------------------------

  /** Read Shlink now and publish what changed. */
  async pollNow({ publish = false } = {}) {
    const changed = await this.poll();
    await this.afterChanges(changed, { publish });
  }

  /** Read again when the last read failed or is older than `freshMs` (scene action). */
  async refreshIfStale() {
    if (this.client && (this.error || this.now() - this.readAt >= this.timings.freshMs)) {
      await this.pollNow();
    }
  }

  /**
   * Read Shlink and apply what changed. Concurrent calls share the read.
   * @returns {Promise<boolean>} whether the widget shows something new
   */
  poll() {
    if (!this.client) {
      return Promise.resolve(false);
    }
    if (!this.polling) {
      const polling = this.read(this.client).finally(() => {
        // A read of a previous client must not drop the promise of the current one.
        if (this.polling === polling) {
          this.polling = null;
        }
      });
      this.polling = polling;
    }
    return this.polling;
  }

  async read(client) {
    const events = [];
    try {
      await this.readServer(client, events);
    } catch (err) {
      if (!(err instanceof ShlinkError)) {
        throw err;
      }
      return client === this.client && this.applyFailure(err);
    }
    return client === this.client && this.applySuccess(events);
  }

  /** The totals, the links (all of them when due) and the added links. */
  async readServer(client, events) {
    const now = this.now();
    const start = startOfDay(now);
    const version = this.version || (await client.version());
    const totals = await client.totals();
    const visitsToday = await client.countSince(start, { excludeBots: true });
    const allToday = await client.countSince(start, { excludeBots: false });
    let list;
    const full = this.linksAt === 0 || now - this.linksAt >= this.timings.linksEveryMs;
    if (full) {
      list = await client.links();
    } else {
      list = await client.linkPage(1, TOP_LINKS);
    }
    if (client !== this.client) {
      return;
    }
    this.version = version;
    const next = full ? new Map() : this.links;
    for (const link of list.links) {
      const key = linkKey(link);
      const known = this.links.get(key);
      const created = this.isCreated(linkIds(this.gladys, link).device);
      // Only the added links are read one by one: the figures of the others
      // (read once by the scene action) would go stale.
      next.set(key, known && created ? { ...known, ...link } : blankLink(link));
    }
    this.links = next;
    if (full) {
      this.linksAt = now;
    }
    this.top = list.links.slice(0, TOP_LINKS).map(linkKey);
    this.server = {
      links: list.total,
      visits: totals.visits,
      bots: totals.bots,
      visitsToday,
      botsToday: Math.max(0, allToday - visitsToday),
    };

    for (const link of [...this.links.values()]) {
      if (!this.isCreated(linkIds(this.gladys, link).device)) {
        continue;
      }
      try {
        await this.readLink(client, link, { start, events });
        this.problems.recover(`link ${linkKey(link)}`, `${linkLabel(link)} read again`);
      } catch (err) {
        if (!(err instanceof ShlinkError)) {
          throw err;
        }
        if (err.kind === ERROR_KINDS.NOT_FOUND) {
          // Deleted since the last list: forget it, list again next time.
          this.links.delete(linkKey(link));
          this.linksAt = 0;
        } else {
          // One link failing is not the server down: the others go on.
          this.problems.fail(`link ${linkKey(link)}`, `${linkLabel(link)}: ${err.message}`);
        }
      }
    }
  }

  /** The visits of one link: total, today, last one, and the new ones. */
  async readLink(client, link, { start, events }) {
    const excludeBots = !this.config.includeBots;
    const humans = await client.linkVisits(link, { excludeBots: true, size: VISITS_PER_READ });
    const today = await client.linkVisits(link, { since: start, excludeBots: true, size: 1 });
    const watched = excludeBots
      ? humans
      : await client.linkVisits(link, { excludeBots: false, size: VISITS_PER_READ });
    // Applied at the end: a failed request leaves the link as it was.
    Object.assign(link, {
      visits: humans.total,
      today: today.total,
      lastVisitAt: humans.items[0]?.at ?? null,
    });
    events.push({ link, items: watched.items });
  }

  async applySuccess(events) {
    const firstRead = this.readAt === 0;
    let widgetChanged = this.error !== null || firstRead;
    if (this.error) {
      logger.info('Shlink answers again');
    }
    if (firstRead) {
      logger.info(
        `Shlink ${this.version || '?'} (${hostOf(this.config.url)}): ${this.server.links} link(s)`,
      );
    }
    this.error = null;
    this.failures = 0;
    this.readAt = this.now();
    const signature = JSON.stringify([this.server, this.top.map((key) => this.links.get(key))]);
    if (signature !== this.widgetSignature) {
      this.widgetSignature = signature;
      widgetChanged = true;
    }

    let dirty = await this.setReachable(true);
    for (const { link, items } of events) {
      dirty = (await this.announceVisits(link, items)) || dirty;
    }
    // A link deleted in Shlink, or removed from Gladys, is forgotten: added
    // again, it starts without announcing the past visits.
    for (const key of Object.keys(this.saved.links)) {
      const link = this.links.get(key);
      if (!link || !this.isCreated(linkIds(this.gladys, link).device)) {
        delete this.saved.links[key];
        dirty = true;
      }
    }
    // Written only when something changed: no wear of the SD card at every read.
    if (dirty) {
      this.store.save(this.saved);
    }
    await this.publishStates();
    return widgetChanged;
  }

  async applyFailure(err) {
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    this.readAt = this.now();
    if (wasError !== err.kind) {
      logger.warn(`Shlink: ${err.message}`);
    }
    if (DOWN_KINDS.has(err.kind)) {
      this.failures += 1;
      if (this.failures === 1) {
        this.firstFailureAt = this.now();
      }
      if (this.failures >= FAILURES_FOR_DOWN && (await this.setReachable(false))) {
        this.store.save(this.saved);
      }
    }
    await this.publishStates();
    return wasError !== err.kind;
  }

  /**
   * The server is reachable or not: fire the scene event of a change. The
   * first state known only records it.
   * @returns {Promise<boolean>} whether the saved state changed
   */
  async setReachable(reachable) {
    const was = this.saved.reachable;
    if (was === reachable) {
      return false;
    }
    this.saved.reachable = reachable;
    const now = this.now();
    const data = { device: serverIds(this.gladys).device, host: hostOf(this.config.url) };
    if (!reachable) {
      this.saved.downSince = this.firstFailureAt ?? now;
      if (was === true) {
        logger.info('Shlink is unreachable');
        await this.fire(TRIGGERS.UNREACHABLE, data);
      }
    } else {
      const since = this.saved.downSince;
      delete this.saved.downSince;
      if (was === false) {
        const minutes = Number.isFinite(since)
          ? Math.max(0, Math.round((now - since) / 60_000))
          : 0;
        logger.info('Shlink is reachable again');
        await this.fire(TRIGGERS.BACK, { ...data, down_minutes: minutes });
      }
    }
    return true;
  }

  /**
   * Fire "New visit" for the visits of a link not seen yet (oldest first).
   * The first read of a link only records what it has.
   * @returns {Promise<boolean>} whether the saved state changed
   */
  async announceVisits(link, items) {
    const key = linkKey(link);
    const saved = this.saved.links[key];
    const before = JSON.stringify(saved);
    const { fresh, seen } = newVisits(items, saved?.seen);
    this.saved.links[key] = { seen };
    if (fresh.length > 0) {
      // Who visited stays out of the logs.
      logger.debug(`${linkLabel(link)}: ${fresh.length} new visit(s)`);
    }
    const data = {
      device: linkIds(this.gladys, link).device,
      link: linkLabel(link),
      short_url: link.shortUrl,
      long_url: link.longUrl,
      visits_today: link.today ?? 0,
    };
    for (const visit of fresh) {
      await this.fire(TRIGGERS.NEW_VISIT, {
        ...data,
        country: visit.country,
        country_code: visit.countryCode,
        referer: visit.referer,
        bot: visit.bot ? 1 : 0,
      });
    }
    return JSON.stringify(this.saved.links[key]) !== before;
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  /** Publish the Discovery list when it changed (a link added, renamed…). */
  async publishDevices({ force = false } = {}) {
    let devices;
    if (!this.client) {
      devices = [];
    } else if (this.readAt === 0 || this.error) {
      return; // nothing read: keep the list Gladys has
    } else {
      const language = this.config.language;
      const links = [...this.links.values()].filter(
        (link, index) =>
          index < MAX_DISCOVERED || this.isCreated(linkIds(this.gladys, link).device),
      );
      devices = [
        buildServerDevice(this.gladys, hostOf(this.config.url), language),
        ...links.map((link) => buildLinkDevice(this.gladys, link, language)),
      ];
    }
    const key = JSON.stringify(devices);
    if (!force && key === this.discovered) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discovered = key;
      this.problems.recover('discovered', 'Discovered devices accepted again');
    } catch (err) {
      this.problems.fail('discovered', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: list the links again, publish the list. */
  async rediscover() {
    this.linksAt = 0;
    await this.poll();
    await this.afterChanges(true, { publish: true });
  }

  /**
   * The user added (or updated) a device: read it now (a link is only read
   * once added), send all its states (the SDK forgot what it had published
   * for it), and its badge.
   */
  async onDeviceCreated(device) {
    this.transports.delete(device.external_id);
    if (parseLinkKey(this.gladys, device.external_id)) {
      await this.pollNow();
    }
    await this.publishStates();
    await this.publishTransports();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** Gladys asks for a refresh (onPoll, only if it polls anyway). */
  async pollDevice() {
    await this.pollNow();
  }

  /**
   * The states of the added devices. The SDK skips the values Gladys already
   * has (and sends an unchanged one again after `heartbeatMs`).
   */
  async publishStates() {
    if (this.readAt === 0) {
      return;
    }
    const states = [];
    if (this.isCreated(serverIds(this.gladys).device)) {
      // During an outage, `reachable` alone (once it counts as one).
      const reachable = this.saved.reachable !== false;
      states.push(...serverValues(this.gladys, this.error ? null : this.server, reachable));
    }
    if (!this.error) {
      for (const link of this.links.values()) {
        if (this.isCreated(linkIds(this.gladys, link).device)) {
          states.push(...linkValues(this.gladys, link));
        }
      }
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.problems.recover('states', 'States accepted again');
    } catch (err) {
      this.problems.fail('states', `States refused: ${err.message}`);
    }
  }

  async afterChanges(widgetChanged, { publish = false } = {}) {
    await this.publishDevices({ force: publish });
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  /** The badge of the added devices: local, or unreachable. */
  async publishTransports() {
    if (!this.client || this.readAt === 0) {
      return;
    }
    const transport = this.error ? DEVICE_TRANSPORTS.UNREACHABLE : DEVICE_TRANSPORTS.LOCAL;
    const ids = [
      serverIds(this.gladys).device,
      ...[...this.links.values()].map((link) => linkIds(this.gladys, link).device),
    ];
    const entries = ids
      .filter((id) => this.isCreated(id) && this.transports.get(id) !== transport)
      .map((id) => ({ external_id: id, transport }));
    for (let at = 0; at < entries.length; at += MAX_TRANSPORTS_PER_REQUEST) {
      const batch = entries.slice(at, at + MAX_TRANSPORTS_PER_REQUEST);
      try {
        await this.gladys.publishTransports(batch);
        for (const entry of batch) {
          this.transports.set(entry.external_id, entry.transport);
        }
        this.problems.recover('transports', 'Transports accepted again');
      } catch (err) {
        this.problems.fail('transports', `Transports refused: ${err.message}`);
      }
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    const missing = missingCredentials(this.config);
    if (missing) {
      return { connected: false, message: CONNECTION_TEXT[missing] };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.problems.recover('connection', 'Connection status accepted again');
    } catch (err) {
      this.problems.fail('connection', `Connection status refused: ${err.message}`);
    }
  }

  // --- Views (widget, scene action, report) ------------------------------------------

  /** The link of a device external id, null when it is not one (or no longer exists). */
  find(externalId) {
    const key = parseLinkKey(this.gladys, externalId);
    return key ? (this.links.get(key) ?? null) : null;
  }

  /** Read one link now when it is not added to Gladys (the scene action). */
  async readOne(link) {
    if (this.client && !this.isCreated(linkIds(this.gladys, link).device)) {
      await this.readLink(this.client, link, { start: startOfDay(this.now()), events: [] });
    }
  }

  /** The most visited links, most visited first. */
  topLinks() {
    return this.top.map((key) => this.links.get(key)).filter(Boolean);
  }

  /** Throws the reason Shlink cannot answer, if any. */
  assertReadable() {
    const status = this.connectionStatus();
    if (!status.connected) {
      throw new Error(pick(status.message, this.config.language));
    }
  }

  /** "Test the connection": read Shlink now, one line. */
  async testConnection() {
    await this.pollNow({ publish: true });
    const message = {};
    const status = this.connectionStatus();
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      if (!status.connected) {
        message[language] = pick(status.message, language);
        continue;
      }
      const parts = [
        text.ok,
        text.links(this.server.links),
        text.today(this.server.visitsToday),
        text.total(this.server.visits),
      ];
      const name = this.version ? `Shlink ${this.version}` : 'Shlink';
      message[language] = labelled(name, parts.join(', '), language);
    }
    return message;
  }
}

/** A link not read yet (the visits of the list until it is). */
export function blankLink(link) {
  return { ...link, today: null, lastVisitAt: null };
}
