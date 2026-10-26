// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and a fake Shlink:
// discovery, states, the "New visit" trigger, the outage triggers, the widget,
// the scene action, the timer of the container, quiet logs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { buildLinkDevice, buildServerDevice } from '../src/devices.js';
import { TRIGGERS, WIDGET_KEY, newVisits } from '../src/hub.js';
import { Store } from '../src/store.js';
import {
  API_KEY,
  BASE,
  createClock,
  createDevices,
  createWorld,
  idsOf,
  sampleShlink,
  serverIdsOf,
} from './helpers/world.js';

const stateOf = (world, featureId) =>
  world.fake.states.filter((s) => s.device_feature_external_id === featureId).at(-1);
const visitEvents = (world) => world.fake.sceneEvents.filter((e) => e.key === TRIGGERS.NEW_VISIT);

async function tick(world, ms = 60_000) {
  world.clock.advance(ms);
  await world.hub.pollNow();
}

test('discovery: the server and every link, nothing published before an add', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  const names = world.fake.discoveredDevices.map((device) => device.name);
  assert.deepEqual(names, [
    'Shlink 192.0.2.20:8080',
    'My blog',
    'Newsletter',
    's.example.test/fBXyw',
  ]);
  assert.equal(world.fake.states.length, 0);
  // Nothing added: no per-link request.
  assert.ok(!world.shlink.requests.some((r) => r.includes('/short-urls/')));
});

test('an added link: total and today without bots, its last visit, then only changes', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  const blog = idsOf(world, 'blog');
  assert.equal(stateOf(world, blog.feature('visits')).state, 2);
  assert.equal(stateOf(world, blog.feature('visits_today')).state, 1);
  assert.equal(stateOf(world, blog.feature('last_visit')).text, '2026-10-15 08:00');
  assert.equal(stateOf(world, idsOf(world, 'fBXyw').feature('last_visit')).text, '-');
  const server = serverIdsOf(world);
  assert.equal(stateOf(world, server.feature('reachable')).state, 1);
  assert.equal(stateOf(world, server.feature('links')).state, 3);
  assert.equal(stateOf(world, server.feature('visits')).state, 3);
  assert.equal(stateOf(world, server.feature('visits_today')).state, 2);
  assert.equal(stateOf(world, server.feature('bot_visits_today')).state, 1);
  assert.ok(world.fake.widgetRefreshes.includes(WIDGET_KEY));

  const before = world.fake.states.length;
  await tick(world);
  assert.equal(world.fake.states.length, before, 'nothing changed, nothing sent');
});

test('"New visit": every new human visit once, oldest first, with country and referer', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  assert.equal(visitEvents(world).length, 0, 'the visits before the add are not announced');

  const at = world.clock.time + 5_000;
  world.shlink.visit('blog', at, { referer: 'https://t.co/abc?u=1' });
  world.shlink.visit('blog', at, { country: { code: 'DE', name: 'Germany' } });
  world.shlink.visit('blog', at, { bot: true });
  await tick(world);
  const events = visitEvents(world);
  assert.equal(events.length, 2, 'two humans, the bot left out');
  assert.deepEqual(
    events.map((e) => [e.data.referer, e.data.country, e.data.country_code, e.data.bot]),
    [
      ['t.co', '', '', 0],
      ['', 'Germany', 'DE', 0],
    ],
  );
  assert.equal(events[0].data.device, idsOf(world, 'blog').device);
  assert.equal(events[0].data.link, 'My blog');
  assert.equal(events[0].data.visits_today, 3);

  // A visit in the same second as the last one seen is new too.
  world.shlink.visit('blog', at);
  await tick(world);
  assert.equal(visitEvents(world).length, 3);
  await tick(world);
  assert.equal(visitEvents(world).length, 3, 'nothing announced twice');
});

test('"New visit" with the bots option: the bots fire, flagged', async (t) => {
  const clock = createClock();
  const world = await createWorld({
    clock,
    config: { url: BASE, api_key: API_KEY, language: 'en', include_bots: true },
  });
  t.after(() => world.app.stop());
  await createDevices(world);
  world.shlink.visit('news', clock.time + 1000, { domain: 'go.example.test', bot: true });
  await tick(world);
  const events = visitEvents(world);
  assert.equal(events.length, 1);
  assert.equal(events[0].data.bot, 1);
  assert.equal(events[0].data.device, idsOf(world, 'news', 'go.example.test').device);
});

test('a restart neither announces a visit twice nor misses one', async () => {
  const clock = createClock();
  const shlink = sampleShlink(clock);
  const first = await createWorld({ clock, shlink });
  await createDevices(first);
  await first.app.stop();
  const devices = first.fake.createdDevices ?? first.gladys.devices;

  shlink.visit('blog', clock.time + 30_000);
  clock.advance(60_000);
  const second = await createWorld({ clock, shlink, dataDir: first.dataDir, devices });
  try {
    assert.equal(visitEvents(second).length, 1, 'the visit made while stopped');
    await tick(second);
    assert.equal(visitEvents(second).length, 1);
  } finally {
    await second.app.stop();
  }
});

test('outage: unreachable after two failed reads, back with its duration', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  const reachable = serverIdsOf(world).feature('reachable');
  world.shlink.down = true;
  await tick(world);
  assert.deepEqual(world.fake.sceneEvents, [], 'one lost answer is no outage');
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.equal(stateOf(world, reachable).state, 1);
  await tick(world);
  assert.deepEqual(
    world.fake.sceneEvents.map((e) => e.key),
    [TRIGGERS.UNREACHABLE],
  );
  assert.equal(world.fake.sceneEvents[0].data.device, serverIdsOf(world).device);
  assert.equal(world.fake.sceneEvents[0].data.host, '192.0.2.20:8080');
  assert.equal(stateOf(world, reachable).state, 0);
  const transports = world.fake.transports ?? {};
  if (transports[serverIdsOf(world).device]) {
    assert.equal(transports[serverIdsOf(world).device], 'unreachable');
  }
  await tick(world, 5 * 60_000);
  assert.equal(world.fake.sceneEvents.length, 1, 'announced once');

  world.shlink.down = false;
  await tick(world);
  const back = world.fake.sceneEvents.at(-1);
  assert.equal(back.key, TRIGGERS.BACK);
  assert.equal(back.data.down_minutes, 6);
  assert.equal(stateOf(world, reachable).state, 1);
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
});

test('a key refused is a configuration problem, not an outage', async (t) => {
  const world = await createWorld({ config: { url: BASE, api_key: 'wrong', language: 'fr' } });
  t.after(() => world.app.stop());
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(String(world.fake.connectionStatus.message?.fr), /clé d'API refusée/);
  await tick(world);
  await tick(world);
  assert.deepEqual(world.fake.sceneEvents, []);
});

test('a link deleted in Shlink is read no more', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  world.shlink.links = world.shlink.links.filter((link) => link.code !== 'fBXyw');
  await tick(world);
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  world.shlink.requests.length = 0;
  await tick(world);
  assert.ok(!world.shlink.requests.some((r) => r.includes('/fBXyw/')));
});

test('the widget: totals and the most visited links, within the core budget', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world, (device) => device.name === 'My blog');
  for (const language of ['en', 'fr', 'de', 'es']) {
    const ack = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language });
    assert.equal(ack.success, true, ack.error);
    const content = ack.data.content;
    assert.deepEqual(validateWidgetContent(content), []);
    assert.ok(content.components.length <= 8);
    assert.ok(content.components.filter((c) => c.type === 'text').length <= 2);
  }
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'en' });
  const rows = ack.data.content.components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    rows.map((row) => [row.label, row.value]),
    [
      ['My blog', '2 · +1 today'],
      ['Newsletter', '1'],
      ['s.example.test/fBXyw', '0'],
    ],
  );
  const refresh = await world.fake.widgetAction(WIDGET_KEY, 'refresh', {});
  assert.equal(refresh.success, true, refresh.error);

  world.shlink.down = true;
  await tick(world);
  const down = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'en' });
  assert.ok(down.data.content.components.some((c) => c.text === 'Shlink does not answer'));
});

test('the widget without configuration asks for it', async (t) => {
  const world = await createWorld({ config: { language: 'en' } });
  t.after(() => world.app.stop());
  assert.equal(world.fake.connectionStatus.connected, false);
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'de' });
  assert.match(ack.data.content.components[0].text, /Shlink-Server/);
});

test('"Read a short link": figures and a sentence in the language of the configuration', async (t) => {
  const world = await createWorld({ config: { url: BASE, api_key: API_KEY, language: 'fr' } });
  t.after(() => world.app.stop());
  // Not added to Gladys: the action reads it itself.
  const ack = await world.fake.sceneAction('get_link_stats', {
    device: idsOf(world, 'news', 'go.example.test').device,
  });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    name: 'Newsletter',
    short_url: 'http://go.example.test/news',
    long_url: 'https://example.org/news',
    visits: 1,
    visits_today: 1,
    last_visit: '2026-10-15 07:00',
    sentence: "Newsletter : 1 visite(s) aujourd'hui, 1 au total, dernière visite 2026-10-15 07:00.",
  });
  const wrong = await world.fake.sceneAction('get_link_stats', {
    device: serverIdsOf(world).device,
  });
  assert.equal(wrong.success, false);
  assert.match(wrong.error, /lien court Shlink/);
});

test('the container reads Shlink on its own timer, without onPoll', async (t) => {
  const world = await createWorld({
    clock: { time: Date.now(), now: () => Date.now() },
    timers: true,
    config: { url: BASE, api_key: API_KEY, language: 'en', poll_interval: '30' },
  });
  t.after(() => world.app.stop());
  // A 30-second interval would make this test slow: shorten the timer.
  world.hub.config.pollIntervalMs = 20;
  world.hub.schedulePoll();
  const before = world.shlink.requests.length;
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.ok(world.shlink.requests.length > before);
});

test('a normal cycle writes nothing at the info level', async (t) => {
  const lines = [];
  const original = process.stdout.write.bind(process.stdout);
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  const level = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'info';
  process.stdout.write = (chunk) => {
    lines.push(String(chunk));
    return true;
  };
  let quiet;
  try {
    world.shlink.visit('blog', world.clock.time + 1000, { referer: 'https://t.co/x' });
    await tick(world);
    await tick(world);
    quiet = [...lines];
    // The capture works: an outage is a lifecycle line.
    world.shlink.down = true;
    await tick(world);
    await tick(world);
  } finally {
    process.stdout.write = original;
    process.env.LOG_LEVEL = level;
  }
  assert.deepEqual(quiet, []);
  assert.ok(
    lines.some((line) => line.includes('Shlink is unreachable')),
    lines.join(''),
  );
  assert.ok(!lines.join('').includes('t.co'), 'no visitor data in the logs');
});

test('newVisits: first sight records only; same-second visits counted', () => {
  const v = (at) => ({ at });
  assert.deepEqual(newVisits([v(5), v(5), v(3)], undefined), {
    fresh: [],
    seen: { at: 5, count: 2 },
  });
  const { fresh, seen } = newVisits([v(7), v(5), v(5), v(5), v(3)], { at: 5, count: 2 });
  assert.deepEqual(
    fresh.map((x) => x.at),
    [5, 7],
  );
  assert.deepEqual(seen, { at: 7, count: 1 });
  // Visits deleted in Shlink: nothing new, start again from the newest.
  assert.deepEqual(newVisits([v(2)], { at: 5, count: 1 }), {
    fresh: [],
    seen: { at: 2, count: 1 },
  });
  assert.deepEqual(newVisits([], { at: 5, count: 1 }).fresh, []);
});

test('device payloads: names in the chosen language, stable external ids', async (t) => {
  const world = await createWorld({ connect: false });
  t.after(() => world.app.stop());
  const link = { code: 'a/b', domain: null, shortUrl: '', longUrl: '', title: '' };
  const device = buildLinkDevice(world.gladys, link, 'de');
  assert.equal(device.external_id, 'ext:test-integration:link:_/a%2Fb');
  assert.deepEqual(
    device.features.map((f) => f.name),
    ['Besuche', 'Besuche heute', 'Letzter Besuch'],
  );
  assert.equal(device.name, 'a/b');
  const server = buildServerDevice(world.gladys, 'host', 'es');
  assert.equal(server.external_id, 'ext:test-integration:server:shlink');
  assert.equal(server.features[0].name, 'Accesible');
  assert.ok(new Store('/nonexistent'));
});
