import * as assert from 'node:assert';
import type { ElectronApplication, Page } from 'playwright-core';
import { strings } from '../../lib/shared/strings';
import { waitFor } from '../helpers/fixtures';
import { onceDrawn, untilSettled } from './waits';

export interface TabLooks {
  readonly focus: string | null;
  readonly caret: readonly [number, number, string] | null;
  readonly fields: readonly (readonly [string, string])[];
  readonly scrolls: readonly (readonly [string, string, number, number])[];
  readonly states: readonly (readonly [string, string])[];
  readonly text: string;
}

const looksNow = (page: Page): Promise<TabLooks> =>
  page.evaluate(() => {
    const root = document.querySelector('.app');
    const shown = (element: Element) =>
      root?.contains(element) === true &&
      element.closest('nav.tabs, .notices, [role="tooltip"]') === null;
    const seen = (box: DOMRect, from: Element | null) => {
      if (from === null || getComputedStyle(from).visibility !== 'visible') {
        return false;
      }
      let left = Math.max(box.left, 0);
      let top = Math.max(box.top, 0);
      let right = Math.min(box.right, window.innerWidth);
      let bottom = Math.min(box.bottom, window.innerHeight);
      for (
        let at: Element | null = from;
        at !== null && at !== root;
        at = at.parentElement
      ) {
        const style = getComputedStyle(at);
        const blinking = style.animationName.startsWith('cursor-blink');
        if (style.opacity === '0' && !blinking) {
          return false;
        }
        if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
          const edge = at.getBoundingClientRect();
          const inside = at.clientWidth > 0 && at.clientHeight > 0;
          const clip = inside
            ? {
                left: edge.left + at.clientLeft,
                top: edge.top + at.clientTop,
                right: edge.left + at.clientLeft + at.clientWidth,
                bottom: edge.top + at.clientTop + at.clientHeight,
              }
            : edge;
          left = Math.max(left, clip.left);
          top = Math.max(top, clip.top);
          right = Math.min(right, clip.right);
          bottom = Math.min(bottom, clip.bottom);
        }
      }
      return right > left && bottom > top;
    };
    const onScreen = (element: Element) =>
      seen(element.getBoundingClientRect(), element);
    const pathOf = (element: Element) => {
      const steps: string[] = [];
      for (
        let at: Element | null = element;
        at !== null && at !== root;
        at = at.parentElement
      ) {
        const { tagName } = at;
        const classes = [...at.classList]
          .filter((part) => !/^xterm-dom-renderer-owner-\d+$/.test(part))
          .join('.');
        const name = `${tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
        const twins = [...(at.parentElement?.children ?? [])].filter(
          (other) =>
            other.tagName === tagName &&
            [...other.classList]
              .filter((part) => !/^xterm-dom-renderer-owner-\d+$/.test(part))
              .join('.') === classes &&
            (other === at || onScreen(other)),
        );
        steps.unshift(
          twins.length > 1 ? `${name}[${twins.indexOf(at)}]` : name,
        );
      }
      return steps.join(' > ');
    };
    const inside = [...(root?.querySelectorAll('*') ?? [])].filter(shown);
    const fields = inside.filter(
      (element): element is HTMLInputElement | HTMLTextAreaElement =>
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement,
    );
    const active = document.activeElement;
    const focused = active !== null && shown(active) ? active : undefined;
    const field = fields.find((each) => each === focused);
    const texts: string[] = [];
    if (root !== null) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (
        let node = walker.nextNode();
        node !== null;
        node = walker.nextNode()
      ) {
        const parent = node.parentElement;
        const text = node.textContent?.trim() ?? '';
        if (parent !== null && text !== '' && shown(parent)) {
          range.selectNodeContents(node);
          if ([...range.getClientRects()].some((box) => seen(box, parent))) {
            texts.push(text);
          }
        }
      }
    }
    return {
      focus: focused === undefined ? null : pathOf(focused),
      caret:
        field === undefined || field.selectionStart === null
          ? null
          : [
              field.selectionStart,
              field.selectionEnd ?? field.selectionStart,
              field.selectionDirection ?? 'none',
            ],
      fields: fields.map((each) => [
        pathOf(each),
        each instanceof HTMLInputElement && each.type === 'checkbox'
          ? String(each.checked)
          : each.value,
      ]),
      scrolls: inside
        .filter(
          (element) =>
            !fields.some((each) => each === element) &&
            (element.scrollTop !== 0 || element.scrollLeft !== 0),
        )
        .map((element) => {
          const box = element.getBoundingClientRect();
          const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
          );
          const range = document.createRange();
          for (
            let node = walker.nextNode();
            node !== null;
            node = walker.nextNode()
          ) {
            const parent = node.parentElement;
            const text = node.textContent?.trim() ?? '';
            let stuck = false;
            for (
              let at = parent;
              at !== null && at !== element;
              at = at.parentElement
            ) {
              const { position } = getComputedStyle(at);
              stuck ||= position === 'sticky' || position === 'fixed';
            }
            range.selectNodeContents(node);
            const top = [...range.getClientRects()].find(
              (rect) =>
                rect.bottom > box.top &&
                rect.top < box.bottom &&
                seen(rect, parent),
            );
            if (text !== '' && !stuck && top !== undefined) {
              return [
                pathOf(element),
                text,
                Math.round(top.top - box.top),
                Math.round(element.scrollLeft),
              ] as const;
            }
          }
          const place = (scrolled: number, room: number) =>
            element.classList.contains('scroll-proxy')
              ? Math.round((100 * scrolled) / Math.max(1, room))
              : Math.round(scrolled);
          return [
            pathOf(element),
            '',
            place(
              element.scrollTop,
              element.scrollHeight - element.clientHeight,
            ),
            place(
              element.scrollLeft,
              element.scrollWidth - element.clientWidth,
            ),
          ] as const;
        }),
      states: inside
        .filter(onScreen)
        .flatMap((element) =>
          ['aria-pressed', 'aria-expanded', 'aria-selected', 'aria-checked']
            .filter((name) => element.hasAttribute(name))
            .map((name) => [
              `${pathOf(element)} ${name}`,
              element.getAttribute(name) ?? '',
            ]),
        ),
      text: texts.join(String.fromCharCode(10)),
    };
  });

const looksAlike = (one: TabLooks, other: TabLooks) =>
  JSON.stringify(one) === JSON.stringify(other);

const tabLooks = async (page: Page): Promise<TabLooks> => {
  await onceDrawn(page);
  return looksNow(page);
};

const newline = String.fromCharCode(10);

const busy: readonly string[] = [
  strings.common.reading,
  strings.find.searching,
];

const scrollerHeld = (page: Page): Promise<boolean> =>
  page.evaluate(() =>
    [...document.querySelectorAll('.app *')].some((element) => {
      const style = getComputedStyle(element);
      return (
        element.closest('nav.tabs, .notices') === null &&
        ['auto', 'scroll'].includes(style.overflowY) &&
        style.opacity === '0'
      );
    }),
  );

export function settledLooks(page: Page, quiet = 400): Promise<TabLooks> {
  return untilSettled(() => tabLooks(page), 'the tab to settle', {
    quiet,
    accepted: async (now) =>
      !busy.some((sentence) => now.text.split(newline).includes(sentence)) &&
      !(await scrollerHeld(page)),
  });
}

export async function scrolledAround(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('.app *')) {
      const style = getComputedStyle(element);
      const down =
        ['auto', 'scroll'].includes(style.overflowY) &&
        element.scrollHeight > element.clientHeight + 1;
      const across =
        ['auto', 'scroll'].includes(style.overflowX) &&
        element.scrollWidth > element.clientWidth + 1;
      if (element.closest('nav.tabs, .notices') === null && (down || across)) {
        element.scrollTo({
          top: down ? (element.scrollHeight - element.clientHeight) / 2 : 0,
          left: across ? (element.scrollWidth - element.clientWidth) / 2 : 0,
        });
      }
    }
  });
}

export const sizedWindow = (app: ElectronApplication): Promise<void> =>
  app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.setSize(1000, 700);
    }
  });

export const tabs = (page: Page) => page.locator('nav.tabs [role="tab"]');

export async function showTab(page: Page, index: number): Promise<void> {
  const tab = tabs(page).nth(index);
  await tab.click();
  await waitFor(
    async () => (await tab.getAttribute('aria-selected')) === 'true',
    `tab ${index} shown`,
  );
}

export async function comesBackAfter(
  page: Page,
  change: () => Promise<Page>,
  what: string,
  settledBefore?: TabLooks,
): Promise<TabLooks> {
  const left = settledBefore ?? (await settledLooks(page, 1000));
  const shown = await change();
  let back = await tabLooks(shown);
  try {
    await waitFor(
      async () => {
        back = await tabLooks(shown);
        return looksAlike(back, left);
      },
      what,
      10_000,
    );
  } catch {
    assert.deepStrictEqual(back, left, `${what} comes back as it was left`);
  }
  const stays = await settledLooks(shown);
  assert.deepStrictEqual(
    stays,
    left,
    `${what} stays as it was left once settled`,
  );
  return stays;
}

export async function comesBackAsLeft(
  page: Page,
  away: number,
  what: string,
  settledBefore?: TabLooks,
): Promise<TabLooks> {
  const index = await tabs(page).evaluateAll((all) =>
    all.findIndex((tab) => tab.getAttribute('aria-selected') === 'true'),
  );
  return comesBackAfter(
    page,
    async () => {
      await showTab(page, away);
      await settledLooks(page);
      await showTab(page, index);
      return page;
    },
    what,
    settledBefore,
  );
}

export async function comesBackFromEach(
  page: Page,
  aways: readonly number[],
  what: (away: number) => string,
): Promise<TabLooks | undefined> {
  let settled: TabLooks | undefined;
  for (const away of aways) {
    settled = await comesBackAsLeft(page, away, what(away), settled);
  }
  return settled;
}
