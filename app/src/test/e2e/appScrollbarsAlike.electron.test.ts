import * as assert from 'node:assert';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { closeOrKill, launchApp } from './appLaunch';
import {
  barOf,
  barParts,
  barsShown,
  paintedAt,
  type Axis,
  type Box,
} from './scrollbarsShown';
import { writeSettings } from './settingsWritten';
import { untilSettled } from './waits';
import {
  alike,
  everyView,
  middle,
  near,
  previews,
  textViews,
  views,
  type ViewName,
} from './scrollbarViews';
import { rounded as roundedApp } from './rounding';
import {
  barSize as size,
  scrollbarProfile,
  settingsWith,
} from './scrollbarFixture';

const gutterOf = (name: ViewName) =>
  name === 'editor'
    ? '.editor .cm-gutters'
    : name === 'diff'
      ? '.diff-view .virtual-row .split-code'
      : '.viewer-gutter';
suite('App scrollbars alike', () => {
  let app: ElectronApplication;
  let page: Page;
  let profile: string;

  beforeAll(async () => {
    profile = await scrollbarProfile();
    app = await launchApp(profile);
    page = await app.firstWindow();
  });

  afterAll(async () => {
    await closeOrKill(app);
  });

  const show = async (name: ViewName) => {
    await page.locator('.tabs .tab').nth(views[name].tab).click();
    await page.locator(views[name].rows).nth(5).waitFor();
    await page.locator(views[name].vertical).first().waitFor();
    await page.mouse.move(2, 2);
    await untilSettled(
      () =>
        page
          .locator(views[name].vertical)
          .first()
          .evaluate((scroller) => {
            const { top, bottom, left, right } =
              scroller.getBoundingClientRect();
            return [
              top,
              bottom,
              left,
              right,
              scroller.scrollHeight,
              scroller.scrollTop,
            ];
          }),
      `the ${name} to rest`,
      { quiet: 200 },
    );
  };

  const searchCommits = async () => {
    await show('commit list');
    await page
      .locator('.columns > .column')
      .first()
      .locator('.column-actions > .search-button')
      .click();
    await page.locator('.locations-popup .search-box-input').waitFor();
    await page.keyboard.type('topic');
    await waitFor(
      () =>
        page
          .locator('.locations-groups')
          .evaluate(
            (scroller) => scroller.scrollHeight > scroller.clientHeight,
          ),
      'the branches found to outgrow their list',
    );
  };

  const stopSearching = async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.locator('.locations-popup').waitFor({ state: 'detached' });
  };

  const inEvery = async <T>(
    names: readonly ViewName[],
    check: (name: ViewName) => Promise<T>,
  ): Promise<Record<string, T>> => {
    const found: Record<string, T> = {};
    for (const name of names) {
      await show(name);
      found[name] = await check(name);
    }
    return found;
  };

  const bar = (name: ViewName, axis: Axis) => {
    const selector = views[name][axis];
    assert.ok(selector, `the ${name} has no ${axis} scrollbar`);
    return barOf(page, selector, axis);
  };

  const firstRow = async (name: ViewName) => {
    const { box } = await bar(name, 'vertical');
    return page.locator(views[name].rows).evaluateAll(
      (rows, from) =>
        rows
          .map((row) => ({
            text: (row.textContent ?? '').slice(0, 24),
            top: Math.round(row.getBoundingClientRect().top - from),
          }))
          .filter(({ top }) => top >= 0)
          .toSorted((one, other) => one.top - other.top)[0],
      Math.round(box.top) - 1,
    );
  };

  const movedFrom = async (name: ViewName, text: string) => {
    let now = text;
    await waitFor(async () => {
      now = (await firstRow(name))?.text ?? text;
      return now !== text;
    }, `the ${name} to move on`);
    return now;
  };

  const insideLines = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((scroller) => {
        const column = scroller.closest('.column');
        if (column === null) {
          throw new Error('What scrolls stands in no column');
        }
        const line = parseFloat(
          getComputedStyle(column).getPropertyValue('--column-line'),
        );
        const { right, bottom } = column.getBoundingClientRect();
        return { right: right - line, bottom: bottom - line };
      });

  const keptInside = async (vertical: string, horizontal?: string) => {
    const frame = await insideLines(vertical);
    const down = (await barOf(page, vertical, 'vertical')).box;
    const across =
      horizontal === undefined
        ? undefined
        : (await barOf(page, horizontal, 'horizontal')).box;
    const within = (box: Box) =>
      box.left + box.width <= frame.right + 0.01 &&
      box.top + box.height <= frame.bottom + 0.01;
    return {
      wide: Math.round(down.width),
      beside: Math.round(frame.right - down.left - down.width) + 0,
      within: within(down) && (across === undefined || within(across)),
    };
  };

  const rested = (name: ViewName) =>
    untilSettled(() => firstRow(name), `the ${name} to rest`);

  test('gives every view a scrollbar of the browser that takes a strip of its own beside what it scrolls, as wide as the settings say, shown whether pointed at or not, drawn alike in every view, a button at either end with its arrow, muted on the one that can scroll no further, the track and the thumb, the page knowing each part where the browser draws it', async () => {
    const seen = await inEvery(everyView, async (name) => {
      const { box } = await bar(name, 'vertical');
      const parts = await barParts(page, box, 'vertical');
      assert.ok(parts.thumb, `the ${name} shows no thumb`);
      await page.mouse.move(2, 2);
      const track = {
        x: box.left + box.width / 2,
        y: parts.thumb.top + parts.thumb.height + 8,
      };
      const [arrowUp, arrowDown, thumb, plain, beside] = await paintedAt(
        app,
        page,
        [
          middle(parts.start),
          middle(parts.end),
          middle(parts.thumb),
          track,
          { x: box.left - 6, y: track.y },
        ],
      );
      const atStart = await page
        .locator(views[name].vertical)
        .first()
        .evaluate((scroller) => scroller.scrollTop <= 0);
      return {
        wide: Math.round(box.width),
        buttons: [parts.start.height, parts.end.height].map(Math.round),
        look: [arrowDown, thumb, plain],
        mutedAtStart: near(arrowUp, arrowDown) !== atStart,
        apart:
          !near(arrowUp, plain) && !near(thumb, plain) && !near(plain, beside),
      };
    });
    const first = seen.commander;
    assert.ok(first);
    assert.deepStrictEqual(
      Object.fromEntries(
        Object.entries(seen).map(([name, { look, ...rest }]) => [
          name,
          {
            ...rest,
            alike: look.every((color, part) => near(color, first.look[part])),
          },
        ]),
      ),
      alike(everyView, {
        wide: size,
        buttons: [size, size],
        apart: true,
        alike: true,
        mutedAtStart: true,
      }),
      JSON.stringify(seen),
    );
  });

  test('moves every view a row on a press of a button of its scrollbar, on and on while it is held, up again on the other, and to where its track is pressed, the thumb centered there, gliding or not as the settings say', async () => {
    for (const smooth of [true, false]) {
      await writeSettings(page, profile, settingsWith(smooth));
      const seen = await inEvery(everyView, async (name) => {
        const { box } = await bar(name, 'vertical');
        const parts = await barParts(page, box, 'vertical');
        const from = await rested(name);
        await page.mouse.click(middle(parts.end).x, middle(parts.end).y);
        const stepped = await rested(name);
        await page.mouse.move(middle(parts.end).x, middle(parts.end).y);
        await page.mouse.down();
        const once = await movedFrom(name, stepped.text);
        await movedFrom(name, once);
        await page.mouse.up();
        const held = await rested(name);
        await page.mouse.click(middle(parts.start).x, middle(parts.start).y);
        const back = await rested(name);
        const before = (await barParts(page, box, 'vertical')).thumb;
        assert.ok(before, `the ${name} has no thumb`);
        const pressed =
          box.top + box.height * (middle(before).y > middle(box).y ? 0.3 : 0.7);
        await page.mouse.click(middle(box).x, pressed);
        await rested(name);
        const jumped = (await barParts(page, box, 'vertical')).thumb;
        assert.ok(jumped, `the ${name} lost its thumb`);
        return {
          stepped: stepped.text !== from.text,
          whole: stepped.top === from.top,
          held: held.text !== stepped.text,
          back: back.text !== held.text,
          centered:
            Math.abs(jumped.top + jumped.height / 2 - pressed) <=
            jumped.height / 5 + 2,
        };
      });
      assert.deepStrictEqual(
        seen,
        alike(everyView, {
          stepped: true,
          whole: true,
          held: true,
          back: true,
          centered: true,
        }),
        `gliding ${smooth}: ${JSON.stringify(seen)}`,
      );
    }
  });

  test('gives the text of the viewer, the editor and the diff a scrollbar below it too while it is not wrapped, alike, the one beside it ending above it, the square between them filled as their tracks are, as it stood empty in the corner as a hole in the two, and none once the text is wrapped', async () => {
    await writeSettings(page, profile, settingsWith(true));
    const unwrapped = await inEvery(textViews, async (name) => {
      const down = (await bar(name, 'vertical')).box;
      const across = (await bar(name, 'horizontal')).box;
      const parts = await barParts(page, across, 'horizontal');
      assert.ok(parts.thumb, `the ${name} shows no thumb below`);
      await page.mouse.move(2, 2);
      const [corner, plain, thumb] = await paintedAt(app, page, [
        { x: middle(down).x, y: middle(across).y },
        { x: parts.thumb.left + parts.thumb.width + 8, y: middle(across).y },
        middle(parts.thumb),
      ]);
      const before = await page
        .locator(views[name].rows)
        .nth(3)
        .evaluate((row) => row.textContent);
      await page.mouse.click(middle(parts.end).x, middle(parts.end).y);
      await rested(name);
      const moved = (await barParts(page, across, 'horizontal')).thumb;
      return {
        tall: Math.round(across.height),
        meets: Math.abs(down.top + down.height - across.top) < 1,
        filled: near(corner, plain) && !near(corner, thumb),
        steps: (moved?.left ?? 0) > parts.thumb.left,
        text: typeof before === 'string' && before.length > 0,
      };
    });
    assert.deepStrictEqual(
      unwrapped,
      alike(textViews, {
        tall: size,
        meets: true,
        filled: true,
        steps: true,
        text: true,
      }),
    );
    await writeSettings(page, profile, settingsWith(true, true));
    const wrapped = await inEvery(textViews, async (name) => {
      const selector = views[name].horizontal;
      assert.ok(selector);
      return (
        !(await page.locator(selector).first().isVisible()) ||
        (await barOf(page, selector, 'horizontal')).box.height < 1
      );
    });
    assert.deepStrictEqual(wrapped, alike(textViews, true));
  });

  test('shows the last line of a text whole above the scrollbar below it, in the viewer, the editor and the diff scrolled to their end, gliding or not, and the last file of the commander whole in its list, as the viewer counted the rows that fit in a height that held that scrollbar and drew its last line under it, where no key and no scrollbar reached it', async () => {
    const ended: readonly ViewName[] = ['commander', ...textViews];
    const focused: Partial<Record<ViewName, string>> = {
      viewer: '.viewer-body',
      editor: '.editor .cm-content',
      diff: '.diff-view > .virtual-rows',
    };
    for (const smooth of [true, false]) {
      await writeSettings(page, profile, settingsWith(smooth));
      const seen = await inEvery(ended, async (name) => {
        const below = textViews.includes(name)
          ? (await bar(name, 'horizontal')).box.top
          : await page
              .locator(views[name].vertical)
              .first()
              .evaluate((list) => list.getBoundingClientRect().bottom);
        await page
          .locator(focused[name] ?? views[name].vertical)
          .first()
          .focus();
        await page.keyboard.press(
          name === 'editor' ? 'ControlOrMeta+End' : 'End',
        );
        await rested(name);
        const last = await untilSettled(
          () =>
            page.locator(views[name].rows).evaluateAll((rows) => {
              const [lowest] = rows
                .map((row) => ({
                  text: row.textContent.slice(0, 40),
                  box: row.getBoundingClientRect(),
                }))
                .filter(({ box }) => box.height > 0)
                .toSorted((one, other) => other.box.top - one.box.top);
              return {
                text: lowest?.text ?? '',
                bottom: lowest?.box.bottom ?? 0,
              };
            }),
          `the last row of the ${name}`,
        );
        const ends = /line 399 |file-399/.test(last.text);
        await page.keyboard.press(
          name === 'editor' ? 'ControlOrMeta+Home' : 'Home',
        );
        await rested(name);
        return { ends, whole: last.bottom <= below + 0.5 };
      });
      assert.deepStrictEqual(
        seen,
        alike(ended, { ends: true, whole: true }),
        `gliding ${String(smooth)}: ${JSON.stringify(seen)}`,
      );
    }
  });

  const endsDrawn = async (name: ViewName, axis: Axis) => {
    await show(name);
    const selector = views[name][axis];
    assert.ok(selector, `the ${name} has no ${axis} scrollbar`);
    const { box } = await bar(name, axis);
    const parts = await barParts(page, box, axis);
    const scrolled = () =>
      page
        .locator(selector)
        .first()
        .evaluate(
          (scroller, way) =>
            way === 'vertical' ? scroller.scrollTop : scroller.scrollLeft,
          axis,
        );
    const atRest = (quiet: number) =>
      untilSettled(scrolled, `the ${name} to rest ${axis}`, { quiet });
    const pressedAsFarAsItGoes = async (end: 'start' | 'end') => {
      await barParts(page, box, axis);
      const button = middle(parts[end]);
      const beyond =
        (end === 'start' ? 1 : -1) *
        ((axis === 'vertical' ? parts[end].height : parts[end].width) / 2 + 2);
      await page.mouse.click(
        axis === 'vertical' ? button.x : button.x + beyond,
        axis === 'vertical' ? button.y + beyond : button.y,
      );
      await atRest(200);
      await page.mouse.move(button.x, button.y);
      await page.mouse.down();
      await atRest(600);
      await page.mouse.up();
      await atRest(200);
    };
    const arrows = async () => {
      await page.mouse.move(2, 2);
      const [first, last] = await paintedAt(app, page, [
        middle(parts.start),
        middle(parts.end),
      ]);
      return { first, last };
    };
    await pressedAsFarAsItGoes('start');
    const start = await untilSettled(arrows, `the arrows of the ${name}`);
    await pressedAsFarAsItGoes('end');
    const end = await untilSettled(arrows, `the arrows of the ${name}`);
    await pressedAsFarAsItGoes('start');
    return {
      apart: !near(start.first, start.last) && !near(end.first, end.last),
      swapped: near(start.first, end.last) && near(start.last, end.first),
    };
  };

  test('draws the button of a scrollbar that can scroll no further as a disabled button, its arrow muted: the one at the top of a view at its start, the one at the bottom once its buttons have taken it as far down as they go, and the other as a button that scrolls, in every view, as the diff stopped three pixels before the end of its scrollbar, its last button drawn as one that scrolls', async () => {
    const seen: Record<string, unknown> = {};
    for (const name of everyView) {
      seen[name] = await endsDrawn(name, 'vertical');
    }
    assert.deepStrictEqual(
      seen,
      alike(everyView, { apart: true, swapped: true }),
      JSON.stringify(seen),
    );
  });

  test('draws the button of the scrollbar below a text that can scroll no further as a disabled button, the one on the left at its start and the one on the right once its buttons have taken it as far across as they go, in the viewer, the editor and the diff alike', async () => {
    const seen: Record<string, unknown> = {};
    for (const name of textViews) {
      seen[name] = await endsDrawn(name, 'horizontal');
    }
    assert.deepStrictEqual(
      seen,
      alike(textViews, { apart: true, swapped: true }),
      JSON.stringify(seen),
    );
  });

  test('marks what changed in a diff and what a find matched on the track of the scrollbar itself, between its buttons, where the thumb comes to stand at them, in the diff, the file viewed and the file edited alike, as a strip of its own beside the scrollbar stood off its track and took the room of the text', async () => {
    const marked = async (name: ViewName, marks: string) => {
      const { box } = await bar(name, 'vertical');
      const parts = await barParts(page, box, 'vertical');
      await page.mouse.move(2, 2);
      await page.locator(marks).first().waitFor({ state: 'attached' });
      const boxes = await page.locator(marks).evaluateAll((each) =>
        each.map((mark) => {
          const { left, right, top, bottom } = mark.getBoundingClientRect();
          return { left, right, top, bottom };
        }),
      );
      return (
        boxes.length > 0 &&
        boxes.every(
          (mark) =>
            mark.left >= box.left - 0.5 &&
            mark.right <= box.left + box.width + 0.5 &&
            mark.top >= parts.start.top + parts.start.height - 0.5 &&
            mark.bottom <= parts.end.top + 0.5,
        )
      );
    };
    const found = async (name: ViewName, focused: string, text: string) => {
      await show(name);
      await page.locator(focused).first().focus();
      await page.keyboard.press('ControlOrMeta+F');
      await page.keyboard.type(text);
      const ticked = await marked(
        name,
        `${views[name].marks} .scrollbar-mark.match`,
      );
      await page.keyboard.press('Escape');
      return ticked;
    };
    await show('diff');
    assert.deepStrictEqual(
      {
        changes: await marked(
          'diff',
          '.diff-view > .scrollbar-marks .scrollbar-mark.added',
        ),
        minimaps: await page.locator('.diff-minimap').count(),
        diff: await found('diff', '.diff-view > .virtual-rows', 'changed'),
        viewer: await found('viewer', '.viewer-body', 'line 20'),
        editor: await found('editor', '.editor .cm-content', 'line 20'),
      },
      { changes: true, minimaps: 0, diff: true, viewer: true, editor: true },
    );
  });

  test('starts the scrollbar below the text of the viewer, the editor and the diff where the text starts, after the line numbers, which scroll nowhere sideways, so its thumb stands under the columns it shows', async () => {
    await writeSettings(page, profile, settingsWith(true));
    const seen = await inEvery(textViews, async (name) => {
      const across = (await bar(name, 'horizontal')).box;
      const gutter = await page
        .locator(gutterOf(name))
        .first()
        .evaluate((element, code) => {
          const { left, right } = element.getBoundingClientRect();
          return code ? left : right;
        }, name === 'diff');
      return across.left >= gutter - 1 && across.left <= gutter + 12;
    });
    assert.deepStrictEqual(seen, alike(textViews, true));
  });

  test('rounds the ends of a scrollbar with the corners of what it stands in once the app has a radius, a menu at both ends, the window of the shortcuts and the card of a list at their bottom, as the browser draws its scrollbars square over a rounded corner', async () => {
    const rounded = async (
      selector: string,
      ends: readonly ('top' | 'bottom')[],
    ) => {
      const { box } = await barOf(page, selector, 'vertical');
      const points = ends.flatMap((end) => {
        const y = end === 'top' ? box.top + 0.5 : box.top + box.height - 1;
        return [
          { x: box.left + box.width - 1, y },
          { x: box.left + box.width / 2, y },
        ];
      });
      const colors = await paintedAt(app, page, points);
      return ends.every(
        (_, end) => !near(colors[end * 2], colors[end * 2 + 1]),
      );
    };
    await roundedApp(page);
    await show('commander');
    const card = await rounded(views.commander.vertical, ['bottom']);
    await page.keyboard.press('F1');
    await page.locator('.shortcuts-pane').waitFor();
    const shortcuts = await rounded('.shortcuts-pane', ['bottom']);
    await page.keyboard.press('F1');
    await page.locator('.shortcuts-pane').waitFor({ state: 'detached' });
    await show('viewer');
    await page.locator('.viewer-body').first().focus();
    await page.keyboard.press('L');
    await page.locator('.menu.filtered-menu').waitFor();
    const menu = await rounded('.menu.filtered-menu', ['top', 'bottom']);
    await page.keyboard.press('Escape');
    assert.deepStrictEqual(
      { card, menu, shortcuts },
      { card: true, menu: true, shortcuts: true },
    );
  });

  test('keeps every scrollbar inside the lines its column draws around it, the one beside what it scrolls against the line on the right, in the lists, the text and the previews of Markdown and of a PDF alike, as the scrollbar of a preview ran under the lines of its column, two pixels of it hidden on the right and below', async () => {
    const seen = await inEvery(everyView, (name) =>
      keptInside(views[name].vertical, views[name].horizontal),
    );
    for (const [name, { tab, vertical }] of Object.entries(previews)) {
      await page.locator('.tabs .tab').nth(tab).click();
      await waitFor(
        () =>
          page
            .locator(vertical)
            .evaluate(
              (scroller) => scroller.scrollHeight > scroller.clientHeight,
            )
            .catch(() => false),
        `the preview of ${name} to outgrow its column`,
      );
      seen[name] = await keptInside(vertical);
    }
    await searchCommits();
    seen['commit search'] = await keptInside('.locations-groups');
    await stopSearching();
    assert.deepStrictEqual(
      seen,
      alike([...everyView, 'Markdown', 'PDF', 'commit search'], {
        wide: size,
        beside: 0,
        within: true,
      }),
      JSON.stringify(seen),
    );
  });

  test('rounds the end of the scrollbar of a preview of Markdown with the corner of its column once the app has a radius, the ends of the scrollbar below a block of code inside it as the block itself is rounded, and leaves those of the scrollbar below a table inside it square, as what scrolls inside a rounded scrollbar took its rounding over', async () => {
    await roundedApp(page);
    await page.locator('.tabs .tab').nth(previews.Markdown.tab).click();
    const code = page.locator('.viewer .markdown pre').first();
    await code.waitFor();
    const rounded = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((scroller) => ({
          scrolls:
            scroller.scrollWidth > scroller.clientWidth ||
            scroller.scrollHeight > scroller.clientHeight,
          round: parseFloat(
            getComputedStyle(scroller).getPropertyValue(
              '--scrollbar-round-end',
            ),
          ),
          corner: parseFloat(
            getComputedStyle(scroller).borderBottomRightRadius,
          ),
        }));
    const preview = await rounded(previews.Markdown.vertical);
    const block = await rounded('.viewer .markdown pre');
    assert.deepStrictEqual(
      {
        preview: { scrolls: preview.scrolls, round: preview.round > 0 },
        code: {
          scrolls: block.scrolls,
          round: block.round > 0 && block.round === block.corner,
        },
        table: await rounded('.viewer .markdown table'),
      },
      {
        preview: { scrolls: true, round: true },
        code: { scrolls: true, round: true },
        table: { scrolls: true, round: 0, corner: 0 },
      },
    );
  });

  test('gives everything that scrolls, in every tab, in the shortcuts, in a menu and in the search of the commits, the one scrollbar as wide as the settings say, so nothing that scrolls anywhere draws another', async () => {
    const seen: Record<string, { of: string; wide: number }[]> = {};
    for (const name of everyView) {
      await show(name);
      seen[name] = await barsShown(page);
    }
    for (const [name, { tab, vertical }] of Object.entries(previews)) {
      await page.locator('.tabs .tab').nth(tab).click();
      await waitFor(
        () =>
          page
            .locator(vertical)
            .evaluate(
              (scroller) => scroller.scrollHeight > scroller.clientHeight,
            )
            .catch(() => false),
        `the preview of ${name} to outgrow its column`,
      );
      seen[name] = await barsShown(page);
    }
    await show('commander');
    await page.keyboard.press('F1');
    await page.locator('.shortcuts-pane').waitFor();
    seen.shortcuts = await barsShown(page);
    await page.keyboard.press('F1');
    await page.locator('.shortcuts-pane').waitFor({ state: 'detached' });
    await show('viewer');
    await page.locator('.viewer-body').first().focus();
    await page.keyboard.press('L');
    await page.locator('.menu.filtered-menu').waitFor();
    seen.menu = await barsShown(page);
    await page.keyboard.press('Escape');
    await page.locator('.menu.filtered-menu').waitFor({ state: 'detached' });
    await searchCommits();
    seen.search = await barsShown(page);
    await stopSearching();

    const shown = (state: string) => (seen[state] ?? []).map(({ of }) => of);
    assert.deepStrictEqual(
      {
        others: Object.values(seen)
          .flat()
          .filter(({ wide }) => Math.abs(wide - size) >= 1),
        commander: shown('commander').includes('virtual-rows'),
        viewer: shown('viewer').filter((of) => of === 'scroll-proxy').length,
        editor: shown('editor').includes('cm-scroller'),
        diff: shown('diff').filter((of) => of === 'scroll-proxy').length,
        commits: shown('commit list').includes('virtual-rows'),
        Markdown: shown('Markdown').includes('column-body'),
        PDF: shown('PDF').includes('pdf-scroll'),
        shortcuts: shown('shortcuts').includes('shortcuts-pane'),
        menu: shown('menu').includes('menu'),
        search: shown('search').includes('locations-groups'),
      },
      {
        others: [],
        commander: true,
        viewer: 1,
        editor: true,
        diff: 2,
        commits: true,
        Markdown: true,
        PDF: true,
        shortcuts: true,
        menu: true,
        search: true,
      },
      JSON.stringify(seen),
    );
  });

  test('moves every view as far on a notch of the wheel turned over its scrollbar as over what it scrolls, down over the one beside it and, with Shift, across over the one below a text, as the wheel over the scrollbar below a diff went nowhere', async () => {
    await writeSettings(page, profile, settingsWith(true));
    const down = await inEvery(everyView, async (name) => {
      const { box } = await bar(name, 'vertical');
      const content = { x: box.left - 120, y: box.top + box.height / 2 };
      const from = await rested(name);
      await page.mouse.move(content.x, content.y);
      await page.mouse.wheel(0, 100);
      await movedFrom(name, from.text);
      const over = await rested(name);
      await page.mouse.wheel(0, -100);
      await movedFrom(name, over.text);
      const back = await rested(name);
      const parts = await barParts(page, box, 'vertical');
      await page.mouse.move(middle(box).x, parts.end.top - 6);
      await page.mouse.wheel(0, 100);
      await movedFrom(name, back.text);
      const onBar = await rested(name);
      await page.mouse.wheel(0, -100);
      await movedFrom(name, onBar.text);
      await rested(name);
      return {
        moved: over.text !== from.text,
        back: back.text === from.text,
        alike: onBar.text === over.text,
      };
    });
    assert.deepStrictEqual(
      down,
      alike(everyView, { moved: true, back: true, alike: true }),
      JSON.stringify(down),
    );

    const raw: Record<string, number[]> = {};
    const across = await inEvery(textViews, async (name) => {
      const below = (await bar(name, 'horizontal')).box;
      const beside = (await bar(name, 'vertical')).box;
      const thumbAt = async () => {
        const { thumb } = await barParts(page, below, 'horizontal');
        assert.ok(thumb, `the ${name} shows no thumb below`);
        return Math.round(thumb.left);
      };
      const restedAt = () => untilSettled(thumbAt, `the ${name} to rest`);
      const turn = async (x: number, y: number, by: number) => {
        await page.mouse.move(x, y);
        await page.keyboard.down('Shift');
        await page.mouse.wheel(0, by);
        await page.keyboard.up('Shift');
        return restedAt();
      };
      const content = {
        x: below.left + below.width / 2,
        y: beside.top + beside.height / 2,
      };
      const from = await restedAt();
      const over = await turn(content.x, content.y, 100);
      const back = await turn(content.x, content.y, -100);
      const onBar = await turn(
        below.left + below.width - size - 6,
        middle(below).y,
        100,
      );
      await turn(content.x, content.y, -100);
      raw[name] = [from, over, back, onBar];
      return {
        moved: over > from + 1,
        back: Math.abs(back - from) <= 1,
        alike: onBar === over,
      };
    });
    assert.deepStrictEqual(
      across,
      alike(textViews, { moved: true, back: true, alike: true }),
      JSON.stringify({ across, raw }),
    );
  });
});
