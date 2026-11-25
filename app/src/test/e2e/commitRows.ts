import type { Page } from 'playwright-core';
import type { SeenCommit } from '../../tools/git/page/commitHits';
import { waitFor } from '../helpers/fixtures';

export const commitsSeen = (page: Page): Promise<SeenCommit[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('.commit-rows .graph-layer')].flatMap(
      (layer) =>
        layer instanceof HTMLElement && layer.checkVisibility()
          ? [...(layer.seenCommits?.() ?? [])]
          : [],
    ),
  );

interface Wanted {
  readonly selected?: boolean;
}

const named = (row: SeenCommit, name: string) =>
  (row.subject ?? '').toLowerCase().includes(name.toLowerCase());

export async function commitSeen(
  page: Page,
  name: string,
  { selected }: Wanted = {},
  timeout = 30_000,
): Promise<SeenCommit> {
  let found: SeenCommit | undefined;
  await waitFor(
    async () => {
      found = (await commitsSeen(page)).find(
        (row) =>
          named(row, name) &&
          (selected === undefined || row.selected === selected),
      );
      return found !== undefined;
    },
    `the commit list to draw ${name}${selected === true ? ' selected' : ''}`,
    timeout,
  );
  if (found === undefined) {
    throw new Error(`No commit ${name} drawn`);
  }
  return found;
}

type Modifier = 'Alt' | 'Control' | 'Meta' | 'Shift' | 'ControlOrMeta';

interface Clicked {
  readonly modifiers?: readonly Modifier[];
  readonly button?: 'left' | 'right' | 'middle';
  readonly clickCount?: number;
}

export function commitRow(page: Page, name: string, wanted: Wanted = {}) {
  const row = {
    waitFor: async (): Promise<void> => {
      await commitSeen(page, name, wanted);
    },
    first: () => row,
    click: async ({
      modifiers = [],
      button = 'left',
      clickCount = 1,
    }: Clicked = {}): Promise<void> => {
      const seen = await commitSeen(page, name, wanted);
      const x = seen.subjectLeft + Math.min(12, seen.width / 4);
      const y = seen.top + seen.line / 2;
      for (const modifier of modifiers) {
        await page.keyboard.down(modifier);
      }
      try {
        await page.mouse.click(x, y, { button, clickCount });
      } finally {
        for (const modifier of modifiers.toReversed()) {
          await page.keyboard.up(modifier);
        }
      }
    },
  };
  return row;
}

interface WantedBubble {
  readonly kind?: string;
  readonly checkedOut?: boolean;
}

type SeenBubble = SeenCommit['bubbles'][number];

async function bubbleSeen(
  page: Page,
  text: string,
  { kind, checkedOut }: WantedBubble = {},
  timeout = 30_000,
): Promise<SeenBubble> {
  let found: SeenBubble | undefined;
  await waitFor(
    async () => {
      found = (await commitsSeen(page))
        .flatMap((row) => row.bubbles)
        .find(
          (bubble) =>
            bubble.text === text &&
            (kind === undefined || bubble.kind === kind) &&
            (checkedOut === undefined || bubble.checkedOut === checkedOut),
        );
      return found !== undefined;
    },
    `the commit list to draw the bubble ${text}`,
    timeout,
  );
  if (found === undefined) {
    throw new Error(`No bubble ${text} drawn`);
  }
  return found;
}

export function commitBubble(
  page: Page,
  text: string,
  wanted: WantedBubble = {},
) {
  return {
    waitFor: async (): Promise<void> => {
      await bubbleSeen(page, text, wanted);
    },
    click: async ({ button = 'left' }: Clicked = {}): Promise<void> => {
      const seen = await bubbleSeen(page, text, wanted);
      await page.mouse.click(seen.left + 4, seen.top + seen.height / 2, {
        button,
      });
    },
  };
}

export const commitsDrawn = (page: Page, count = 10): Promise<void> =>
  waitFor(
    async () =>
      Math.max(
        (await commitsSeen(page)).filter((row) => row.kind === 'commit').length,
        await page.locator('.commit-rows .commit').count(),
      ) >= count,
    `the commit list to draw ${count} commits`,
    60_000,
  );
