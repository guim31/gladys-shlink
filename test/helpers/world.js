// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Shlink, a temporary
// /data and a manual clock, with the integration wired on top through
// registerHandlers. No timer runs: the tests read Shlink with
// `world.hub.pollNow()`. (From guim31/gladys-umami.)
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { linkIds, serverIds } from '../../src/devices.js';
import { Store } from '../../src/store.js';
import { API_KEY, BASE, DEFAULT_DOMAIN, FakeShlink } from './fakeShlink.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

/** A manual clock, shared by the hub and the tests: 15/10/2026, 10:00 local. */
export function createClock(start = new Date(2026, 9, 15, 10, 0, 0).getTime()) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/** A Shlink with two links on the default domain and one on another. */
export function sampleShlink(clock) {
  const shlink = new FakeShlink();
  shlink.addLink({ code: 'blog', title: 'My blog' });
  shlink.addLink({ code: 'fBXyw' });
  shlink.addLink({ code: 'news', domain: 'go.example.test', title: 'Newsletter' });
  const hour = 3600_000;
  shlink.visit('blog', clock.time - 30 * hour);
  shlink.visit('blog', clock.time - 2 * hour, { referer: 'https://news.example.com/post' });
  shlink.visit('blog', clock.time - hour, { bot: true });
  shlink.visit('news', clock.time - 3 * hour, { domain: 'go.example.test' });
  return shlink;
}

export async function createWorld({
  clock = createClock(),
  shlink = sampleShlink(clock),
  config = { url: BASE, api_key: API_KEY, language: 'en' },
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-shlink-')),
  timings = {},
  timers = false,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: shlink.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, shlink, app, hub: app.hub, clock, dataDir };
}

/** External ids of the device of a link of the fake. */
export const idsOf = (world, code, domain = null) => linkIds(world.gladys, { code, domain });
export const serverIdsOf = (world) => serverIds(world.gladys);

/** Add discovered devices in Gladys, as the user would (all by default). */
export async function createDevices(world, filter = () => true) {
  for (const device of world.fake.discoveredDevices.filter(filter)) {
    await world.fake.deviceCreated(device);
  }
}

export { API_KEY, BASE, DEFAULT_DOMAIN, FakeShlink };
