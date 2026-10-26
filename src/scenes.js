// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// A threshold on one figure is already a scene condition on the device
// feature. The action is about what a condition cannot do: put the figures of
// a short link in a message ("Newsletter: 12 visits today, 340 in all, last
// visit 2026-10-26 17:05"). It reads Shlink again when the last read is older
// than 15 seconds, and reads the link itself when it is not added to Gladys.
// -----------------------------------------------------------------------------

import { missingCredentials } from './config.js';
import { lastVisitText, linkLabel } from './devices.js';
import { ShlinkError } from './shlink/client.js';
import { ACTION_TEXT, CONNECTION_TEXT, ERROR_TEXT, SENTENCE_TEXT, pick } from './texts.js';

export const SCENE_ACTIONS = {
  async get_link_stats(hub, { fields = {} }) {
    const language = hub.config.language;
    const missing = missingCredentials(hub.config);
    if (missing) {
      throw new Error(pick(CONNECTION_TEXT[missing], language));
    }
    // After a failed read too: a short outage must not fail the scene.
    await hub.refreshIfStale();
    hub.assertReadable();
    const link = hub.find(fields.device);
    if (!link) {
      throw new Error(pick(ACTION_TEXT.unknownLink, language));
    }
    try {
      await hub.readOne(link);
    } catch (err) {
      if (!(err instanceof ShlinkError)) {
        throw err;
      }
      throw new Error(pick(ERROR_TEXT[err.kind], language), { cause: err });
    }
    const name = linkLabel(link);
    const today = link.today ?? 0;
    const words = SENTENCE_TEXT[language] ?? SENTENCE_TEXT.en;
    const last = link.lastVisitAt ? words.last(lastVisitText(link)) : words.never;
    return {
      name,
      short_url: link.shortUrl,
      long_url: link.longUrl,
      visits: link.visits,
      visits_today: today,
      last_visit: link.lastVisitAt ? lastVisitText(link) : '',
      sentence: `${words.visits(name, today, link.visits)}, ${last}.`,
    };
  },
};
