import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Page } from 'playwright-core';
import { defaultSettings } from '../helpers/fixtures';
import { resetMark, shownReset } from './settingsReset';

let writes = 0;

const savedByApp = /^settings\.user\.json\.[0-9a-f]+\.tmp$/;

export function markedSettings(settings: object, count: number): object {
  if (count === 0) {
    return settings;
  }
  const fonts: unknown = Reflect.get(settings, 'fonts');
  const set = typeof fonts === 'object' && fonts !== null ? fonts : {};
  const family: unknown = Reflect.get(set, 'family');
  return {
    ...settings,
    fonts: {
      ...set,
      family: `${typeof family === 'string' ? family : defaultSettings().fonts.family}, ${resetMark(count)}`,
    },
  };
}

export function appSaving(profile: string): boolean {
  return fs.readdirSync(profile).some((name) => savedByApp.test(name));
}

export async function writeSettings(
  page: Page,
  profile: string,
  settings: object,
): Promise<number> {
  const file = path.join(profile, 'settings.user.json');
  writes = await shownReset(
    {
      read: () => {
        try {
          return fs.readFileSync(file, 'utf8');
        } catch {
          return undefined;
        }
      },
      write: (text) => fs.writeFileSync(file, text),
      saving: () => appSaving(profile),
      shown: () =>
        page
          .evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue(
              '--font-family',
            ),
          )
          .catch(() => ''),
    },
    (count) => `${JSON.stringify(markedSettings(settings, count))}\n`,
    writes + 1,
  );
  return writes;
}
