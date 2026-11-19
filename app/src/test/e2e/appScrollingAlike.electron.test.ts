import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { tempRepository } from '../helpers/repositories';
import { tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { barOf, barParts, type Axis } from './scrollbarsShown';
import { writeSettings } from './settingsWritten';
import { untilSettled } from './waits';

const perNotch = 10;
const touched = 13;

const lines = (changed: boolean) =>
  Array.from(
    { length: 400 },
    (_, row) =>
      `line ${row}${changed && row % 50 === 7 ? ' changed' : ''} ${'of words that reach far past the right edge of the window '.repeat(6)}end`,
  ).join('\n');

const views = {
  commander: {
    tab: 0,
    pane: '.commander-pane:not(.inactive) .virtual-rows',
    rows: '.virtual-row',
    vertical: '.commander-pane:not(.inactive) .virtual-rows',
    horizontal: undefined,
    across: undefined,
  },
  viewer: {
    tab: 1,
    pane: '.viewer-body',
    rows: '.viewer-row:not(.viewer-probe)',
    vertical: '.viewer-body .scroll-proxy.vertical',
    horizontal: '.viewer-sideways',
    across: '.viewer-sideways',
  },
  editor: {
    tab: 2,
    pane: '.editor .cm-scroller',
    rows: '.cm-line',
    vertical: '.editor .cm-scroller',
    horizontal: '.editor .cm-editor > .scroll-proxy-frame .scroll-proxy',
    across: '.editor .cm-scroller',
  },
  diff: {
    tab: 3,
    pane: '.diff-view .virtual-rows',
    rows: '.virtual-row',
    vertical: '.diff-view > .virtual-rows',
    horizontal: '.diff-view .scroll-proxy.horizontal',
    across: '.diff-row .split-code .code',
  },
  'commit list': {
    tab: 4,
    pane: '.virtual-rows.list',
    rows: '.virtual-row',
    vertical: '.virtual-rows.list',
    horizontal: undefined,
    across: undefined,
  },
} as const;

type ViewName = keyof typeof views;

const everyView: readonly ViewName[] = [
  'commander',
  'viewer',
  'editor',
  'diff',
  'commit list',
];

const textViews: readonly ViewName[] = ['viewer', 'editor', 'diff'];

const axes: readonly Axis[] = ['vertical', 'horizontal'];

interface Place {
  readonly state: string;
  readonly part: number;
  readonly onRow: boolean;
  readonly row: number;
}

function placeDown(pane: Element, rows: string): Place {
  const top = pane.getBoundingClientRect().top;
  const header = pane.querySelector('.diff-stuck-header > *, .pinned-rows');
  const covered =
    (header?.getBoundingClientRect().bottom ?? top) -
    top +
    (parseFloat(getComputedStyle(pane).scrollPaddingTop) || 0);
  const boxes = [...pane.querySelectorAll(rows)]
    .map((row) => ({
      box: row.getBoundingClientRect(),
      text: (row.textContent ?? '').slice(0, 24),
    }))
    .filter(({ box }) => box.height > 0 && box.bottom > top + covered + 0.5)
    .toSorted((one, other) => one.box.top - other.box.top);
  const [first] = boxes;
  const row = first?.box.height ?? 1;
  const lists = pane.querySelector('.viewer-rows');
  const turned = lists
    ? (pane.querySelector('.viewer-sideways')?.scrollTop ?? 0) / row
    : 0;
  const shifted = lists
    ? Math.abs(turned - Math.round(turned)) < 0.001
      ? 0
      : (turned - Math.floor(turned)) * row
    : pane.scrollTop % row;
  const offset = first ? first.box.top - top - covered : 0;
  return {
    state: `${Math.round(pane.scrollTop * 10)}|${first?.text ?? ''}|${Math.round(offset * 10)}`,
    part: shifted,
    onRow: boxes.some(({ box }) => Math.abs(box.top - top - covered) < 0.6),
    row,
  };
}

function placeAcross(moved: Element): Place {
  const left =
    moved.scrollWidth > moved.clientWidth + 1
      ? moved.scrollLeft
      : -new DOMMatrix(getComputedStyle(moved).transform).m41;
  const probe = document.createElement('span');
  probe.style.cssText =
    'position: absolute; visibility: hidden; font-family: var(--monospace-font-family); font-size: var(--monospace-font-size); width: round(1ch, var(--device-pixel, 1px))';
  (moved.closest('.diff-view, .viewer, .cm-editor') ?? moved).append(probe);
  const column = probe.getBoundingClientRect().width || 1;
  probe.remove();
  const columns = left / column;
  return {
    state: String(Math.round(left * 10)),
    part: left % column,
    onRow: Math.abs(columns - Math.round(columns)) < 0.05,
    row: column,
  };
}

const between = (samples: readonly string[]) =>
  new Set(samples).size > 2 && samples.at(-1) !== samples[0];

const still = (samples: readonly string[]) => new Set(samples).size === 1;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sampled = async (
  read: () => Promise<Place>,
  act: () => Promise<void>,
  time = 700,
) => {
  const samples: string[] = [(await read()).state];
  const parts: number[] = [];
  const doing = { now: true };
  const acted = act().finally(() => {
    doing.now = false;
  });
  const until = Date.now() + time;
  while (doing.now || Date.now() < until) {
    const place = await read();
    samples.push(place.state);
    parts.push(place.part);
  }
  await acted;
  return { samples, parts, last: await read() };
};

const settingsWith = (smooth: boolean, smoothSnap: boolean) => ({
  scrolling: { smooth, smoothSnap, wheelRows: perNotch },
  text: { wordWrap: false },
});

const fittingFrom = Object.keys(views).length;

const alike = <T>(names: readonly ViewName[], value: T) =>
  Object.fromEntries(names.map((name) => [name, value]));

function recordPainted(
  down: typeof placeDown,
  sideways: typeof placeAcross,
  pane: string,
  rows: string,
  moved: string | null,
): void {
  const seen: { readonly state: string; readonly at: number }[] = [];
  Reflect.set(window, 'placesPainted', seen);
  Reflect.set(window, 'placesWatched', true);
  const read = () => {
    const element = document.querySelector(moved ?? pane);
    if (element !== null) {
      seen.push({
        state:
          moved === null ? down(element, rows).state : sideways(element).state,
        at: performance.now(),
      });
    }
  };
  const frame = () => {
    if (Reflect.get(window, 'placesWatched') !== true) {
      return;
    }
    const painted = new MessageChannel();
    painted.port1.addEventListener('message', read, { once: true });
    painted.port1.start();
    painted.port2.postMessage(0);
    requestAnimationFrame(frame);
  };
  read();
  requestAnimationFrame(frame);
}

function paintedPlaces(): { state: string; at: number }[] {
  Reflect.set(window, 'placesWatched', false);
  const seen: unknown = Reflect.get(window, 'placesPainted');
  return Array.isArray(seen)
    ? seen.map((each: unknown) => ({
        state: String(Reflect.get(Object(each), 'state')),
        at: Number(Reflect.get(Object(each), 'at')),
      }))
    : [];
}

function thumbShownAt(bar: {
  readonly axis: string;
  readonly left: number;
  readonly top: number;
}): boolean | null {
  const cover = document.querySelector(`.scrollbar-cover.${bar.axis}.shown`);
  const thumb = cover?.querySelector<HTMLElement>('.scrollbar-thumb');
  const box = cover?.getBoundingClientRect();
  return !thumb ||
    !box ||
    Math.abs(box.left - bar.left) > 1 ||
    Math.abs(box.top - bar.top) > 1
    ? null
    : !thumb.hidden;
}

const longestFrame = 100;

function stalled(painted: readonly { state: string; at: number }[]): boolean {
  const first = painted.findIndex((each) => each.state !== painted[0]?.state);
  const last = painted.findLastIndex(
    (each, index) => index > 0 && each.state !== painted[index - 1]?.state,
  );
  return (
    first !== -1 &&
    painted
      .slice(first, last + 1)
      .some(
        (each, index) =>
          each.at - (painted[first + index - 1]?.at ?? each.at) > longestFrame,
      )
  );
}

suite('App scrolling alike', () => {
  let app: ElectronApplication;
  let page: Page;
  let profile: string;

  const down = (name: ViewName) =>
    page
      .locator(views[name].pane)
      .first()
      .evaluate(placeDown, views[name].rows);

  const across = (name: ViewName) => {
    const moved = views[name].across;
    assert.ok(moved, `the ${name} scrolls nowhere sideways`);
    return page.locator(moved).first().evaluate(placeAcross);
  };

  const show = async (name: ViewName, fitting = false) => {
    const { tab, pane, rows } = views[name];
    await page
      .locator('.tabs .tab')
      .nth(tab + (fitting ? fittingFrom : 0))
      .click();
    await page.locator(pane).first().waitFor();
    await page
      .locator(`${pane} ${rows}`)
      .nth(fitting ? 1 : 5)
      .waitFor();
    await page
      .locator(name === 'editor' ? '.editor .cm-content' : pane)
      .first()
      .focus();
    await page.keyboard.press(
      name === 'editor' ? 'ControlOrMeta+Home' : 'Home',
    );
    await waitFor(async () => {
      const first = await down(name);
      await pause(300);
      return first.state === (await down(name)).state;
    }, `the ${name} at rest`);
  };

  const center = async (name: ViewName) => {
    const box = await page.locator(views[name].pane).first().boundingBox();
    assert.ok(box, `the ${name} has no box`);
    await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2);
    return box;
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

  const inEveryFitting = async <T>(
    check: (name: ViewName) => Promise<T>,
  ): Promise<Record<string, T>> => {
    const found: Record<string, T> = {};
    for (const name of everyView) {
      found[name] = await check(name);
    }
    return found;
  };

  beforeAll(async () => {
    const folder = tempFolder('scrolling-alike');
    profile = path.join(folder, 'profile');
    const opened = path.join(folder, 'opened');
    fs.mkdirSync(opened, { recursive: true });
    fs.mkdirSync(profile, { recursive: true });
    for (let file = 0; file < 300; file++) {
      fs.writeFileSync(
        path.join(opened, `file-${String(file).padStart(3, '0')}.txt`),
        '',
      );
    }
    const one = path.join(folder, 'long-one.txt');
    const two = path.join(folder, 'long-two.txt');
    fs.writeFileSync(one, lines(false));
    fs.writeFileSync(two, lines(true));
    const repository = await tempRepository(path.join(folder, 'repo'));
    for (let index = 0; index < 150; index++) {
      await repository.git('commit', '--allow-empty', '-m', `step ${index}`);
    }
    const few = path.join(folder, 'few');
    fs.mkdirSync(few);
    for (const name of ['a.txt', 'b.txt', 'c.txt']) {
      fs.writeFileSync(path.join(few, name), '');
    }
    const shortOne = path.join(folder, 'short-one.txt');
    const shortTwo = path.join(folder, 'short-two.txt');
    fs.writeFileSync(
      shortOne,
      ['one', 'two', 'three', 'four'].join(String.fromCharCode(10)),
    );
    fs.writeFileSync(
      shortTwo,
      ['one', 'two changed', 'three', 'four'].join(String.fromCharCode(10)),
    );
    const young = await tempRepository(path.join(folder, 'young'));
    for (let index = 0; index < 3; index++) {
      await young.git('commit', '--allow-empty', '-m', `step ${index}`);
    }
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [
          { id: '1', tool: 'commander', root: opened },
          { id: '2', tool: 'viewer', root: one },
          { id: '3', tool: 'editor', root: one },
          { id: '4', tool: 'diff', compare: { old: one, new: two } },
          { id: '5', tool: 'git', root: repository.root },
          { id: '6', tool: 'commander', root: few },
          { id: '7', tool: 'viewer', root: shortOne },
          { id: '8', tool: 'editor', root: shortOne },
          { id: '9', tool: 'diff', compare: { old: shortOne, new: shortTwo } },
          { id: '10', tool: 'git', root: young.root },
        ],
        activeTab: '1',
      }),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify(settingsWith(true, true)),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
  });

  afterAll(async () => {
    await closeOrKill(app);
  });

  const scrollsSet = (smooth: boolean, smoothSnap: boolean) =>
    writeSettings(page, profile, settingsWith(smooth, smoothSnap));

  const thumbsShown = async (name: ViewName) => {
    const shown: boolean[] = [];
    for (const axis of axes) {
      const selector = views[name][axis];
      if (selector === undefined) {
        continue;
      }
      const { box } = await barOf(page, selector, axis);
      let nudge = 0;
      await waitFor(async () => {
        nudge = 1 - nudge;
        await page.mouse.move(
          box.left + box.width / 2 + nudge,
          box.top + box.height / 2 + nudge,
        );
        const thumb = await page.evaluate(thumbShownAt, {
          axis,
          left: box.left,
          top: box.top,
        });
        if (thumb === null) {
          return false;
        }
        shown.push(thumb);
        return true;
      }, `the ${axis} scrollbar of the ${name} to take the pointer`);
    }
    return shown.filter(Boolean).length;
  };

  const fitting = async (name: ViewName) => {
    await show(name, true);
    const { pane, rows, across: sideways } = views[name];
    const box = await center(name);
    const under = page.locator(`${pane} ${rows}`).nth(1);
    const stroke = (by: { deltaX?: number; deltaY?: number }) =>
      under.evaluate((row, delta) => {
        for (let swipe = 0; swipe < 3; swipe++) {
          row.dispatchEvent(
            new WheelEvent('wheel', {
              ...delta,
              bubbles: true,
              cancelable: true,
            }),
          );
        }
      }, by);
    const read = async () => {
      const place = await down(name);
      const left = sideways === undefined ? '' : (await across(name)).state;
      return { ...place, state: `${place.state} ${left} ${place.part}` };
    };
    const { samples } = await sampled(
      read,
      async () => {
        await page.mouse.wheel(0, 100);
        await pause(250);
        await stroke({ deltaY: touched });
        await pause(250);
        await page.keyboard.press('PageDown');
        await page.keyboard.press('ArrowDown');
        await pause(250);
        await page.keyboard.down('Shift');
        await page.mouse.wheel(0, 100);
        await page.keyboard.up('Shift');
        await stroke({ deltaX: touched });
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
      },
      400,
    );
    return { still: still(samples), thumbs: await thumbsShown(name) };
  };

  const pressed = async (
    name: ViewName,
    sideways: boolean,
    act: () => Promise<void>,
  ) => {
    const { pane, rows, across: moved } = views[name];
    const once = async () => {
      await page.evaluate(
        `(${String(recordPainted)})(${String(placeDown)}, ${String(placeAcross)}, ${JSON.stringify(pane)}, ${JSON.stringify(rows)}, ${JSON.stringify(sideways ? moved : null)})`,
      );
      await act();
      const last = await untilSettled(
        () => (sideways ? across(name) : down(name)),
        `the ${name} to rest`,
      );
      const painted = await page.evaluate(paintedPlaces);
      const samples = painted.map((each) => each.state);
      return {
        seen: {
          moved: samples.at(-1) !== samples[0],
          glides: between(samples),
          whole: last.onRow,
        },
        unclear: stalled(painted),
      };
    };
    let shown = await once();
    for (
      let again = 0;
      again < 2 && shown.unclear && shown.seen.moved && !shown.seen.glides;
      again++
    ) {
      const next = await once();
      if (!next.seen.moved) {
        break;
      }
      shown = next;
    }
    return shown.seen;
  };

  const wheeled = async (name: ViewName) => {
    await center(name);
    return pressed(name, false, () => page.mouse.wheel(0, 100));
  };

  const keyed = async (name: ViewName, key: string, times = 1) => {
    for (let press = 1; press < times; press++) {
      await page.keyboard.press(key);
      await pause(400);
    }
    return pressed(name, false, () => page.keyboard.press(key));
  };

  const swiped = async (
    name: ViewName,
    read: () => Promise<Place>,
    delta: { readonly deltaX?: number; readonly deltaY?: number },
  ) => {
    const before = await read();
    const { parts, samples } = await sampled(read, () =>
      page
        .locator(`${views[name].pane} ${views[name].rows}`)
        .nth(3)
        .evaluate((under, by) => {
          for (let swipe = 0; swipe < 2; swipe++) {
            under.dispatchEvent(
              new WheelEvent('wheel', {
                ...by,
                bubbles: true,
                cancelable: true,
              }),
            );
          }
        }, delta),
    );
    const part = (before.part + 2 * touched) % before.row;
    const rested = await untilSettled(read, `the ${name} to rest`);
    return {
      moved: samples.at(-1) !== samples[0],
      followed: parts.some(
        (seen) =>
          Math.abs(seen - part) < 1 && part > 1.5 && part < before.row - 1.5,
      ),
      whole: rested.onRow,
    };
  };

  const barHeld = async (
    name: ViewName,
    read: () => Promise<Place>,
    axis: Axis,
  ) => {
    const selector = views[name][axis];
    assert.ok(selector, `the ${name} has no ${axis} scrollbar`);
    const { box } = await barOf(page, selector, axis);
    const { thumb } = await barParts(page, box, axis);
    assert.ok(thumb, `the ${axis} scrollbar of the ${name} has no thumb`);
    const x = thumb.left + thumb.width / 2;
    const y = thumb.top + thumb.height / 2;
    const at = (by: number) =>
      axis === 'horizontal' ? ([x + by, y] as const) : ([x, y + by] as const);
    const before = await read();
    await page.mouse.move(...at(0));
    await page.mouse.down();
    await page.mouse.move(...at(23), { steps: 4 });
    const held = await sampled(read, async () => undefined, 300);
    const places = [held.last];
    for (const by of [30, 34]) {
      await page.mouse.move(...at(by));
      await pause(100);
      places.push(await read());
    }
    await page.mouse.up();
    const rested = await untilSettled(read, `the ${name} to rest once let go`);
    return {
      moved: held.last.state !== before.state,
      still: still(held.samples),
      between: places.some((place) => !place.onRow),
      whole: rested.onRow,
    };
  };

  const acrossViews: readonly ViewName[] = ['viewer', 'diff'];

  test('glides every view while scrolling glides on whatever is pressed, a notch of the wheel, Page Down, an arrow or End, through places between where it was and where it comes to rest, on a whole row, the commit list and the file viewed as the others, which jumped on their keys, and the editor as its cursor is paged, sent to the end of the file or brought back into view by an arrow, which the caret of the browser scrolled at once', async () => {
    const glided = { moved: true, glides: true, whole: true };
    const arrowed: readonly ViewName[] = ['viewer', 'editor', 'diff'];
    const ended: readonly ViewName[] = [
      'commander',
      'editor',
      'diff',
      'commit list',
    ];
    assert.deepStrictEqual(
      {
        wheel: await inEvery(everyView, wheeled),
        pageDown: await inEvery(everyView, (name) =>
          keyed(name, 'PageDown', 2),
        ),
        arrowDown: await inEvery(arrowed, async (name) => {
          if (name === 'editor') {
            await center(name);
            await page.mouse.wheel(0, 100);
            await pause(600);
          }
          return keyed(name, 'ArrowDown');
        }),
        end: await inEvery(ended, async (name) => {
          const { moved, whole } = await keyed(
            name,
            name === 'editor' ? 'ControlOrMeta+End' : 'End',
          );
          return { moved, whole };
        }),
      },
      {
        wheel: alike(everyView, glided),
        pageDown: alike(everyView, glided),
        arrowDown: alike(arrowed, glided),
        end: alike(ended, { moved: true, whole: true }),
      },
    );
  });

  test('moves every view while scrolling glides with whatever is held, at once and by pixels, between rows too, its scrollbar staying where the pointer holds it rather than gliding after it and a touchpad moving it as far as it is stroked, the file viewed as the lists, and settles on a whole row once let go', async () => {
    assert.deepStrictEqual(
      {
        scrollbar: await inEvery(everyView, (name) =>
          barHeld(name, () => down(name), 'vertical'),
        ),
        touchpad: await inEvery(everyView, (name) =>
          swiped(name, () => down(name), { deltaY: touched }),
        ),
      },
      {
        scrollbar: alike(everyView, {
          moved: true,
          still: true,
          between: true,
          whole: true,
        }),
        touchpad: alike(everyView, {
          moved: true,
          followed: true,
          whole: true,
        }),
      },
    );
  });

  test('scrolls the text of the viewer, the editor and the diff sideways as it scrolls down while scrolling glides, gliding onto a whole column on the wheel with Shift and on Right, and following the scrollbar held and a touchpad stroked sideways at once, between columns too, to settle on a whole column once let go', async () => {
    assert.deepStrictEqual(
      {
        wheel: await inEvery(textViews, async (name) => {
          await center(name);
          return pressed(name, true, async () => {
            await page.keyboard.down('Shift');
            await page.mouse.wheel(0, 100);
            await page.keyboard.up('Shift');
          });
        }),
        right: await inEvery(acrossViews, (name) =>
          pressed(name, true, () => page.keyboard.press('ArrowRight')),
        ),
        scrollbar: await inEvery(textViews, (name) =>
          barHeld(name, () => across(name), 'horizontal'),
        ),
        touchpad: await inEvery(textViews, (name) =>
          swiped(name, () => across(name), { deltaX: touched }),
        ),
      },
      {
        wheel: alike(textViews, { moved: true, glides: true, whole: true }),
        right: alike(acrossViews, { moved: true, glides: true, whole: true }),
        scrollbar: alike(textViews, {
          moved: true,
          still: true,
          between: true,
          whole: true,
        }),
        touchpad: alike(textViews, {
          moved: true,
          followed: true,
          whole: true,
        }),
      },
    );
  });

  test('leaves every view where a touchpad left it, between rows and between columns, once the settings say not to settle what was held, scrolling still gliding', async () => {
    await scrollsSet(true, false);
    assert.deepStrictEqual(
      {
        down: await inEvery(everyView, (name) =>
          swiped(name, () => down(name), { deltaY: touched }),
        ),
        across: await inEvery(textViews, (name) =>
          swiped(name, () => across(name), { deltaX: touched }),
        ),
      },
      {
        down: alike(everyView, { moved: true, followed: true, whole: false }),
        across: alike(textViews, {
          moved: true,
          followed: true,
          whole: false,
        }),
      },
    );
  });

  test('leaves every view as it is while all of it fits in the view, scrolling gliding: nothing moves or shifts on the wheel, a touchpad stroked down or sideways, or the keys, and no scrollbar of it has a thumb, as a short file viewed shook on each notch of the wheel and showed a thumb as long as its view', async () => {
    await scrollsSet(true, true);
    assert.deepStrictEqual(
      await inEveryFitting(fitting),
      alike(everyView, { still: true, thumbs: 0 }),
    );
  });

  test('lands every view on whole rows and whole columns at once while scrolling does not glide, whatever moves it, the wheel, the keys, a scrollbar held or a touchpad, with nothing between and nothing left to settle', async () => {
    await scrollsSet(false, true);
    const landed = { moved: true, glides: false, whole: true };
    const stepped = { moved: true, followed: false, whole: true };
    const dragged = { moved: true, still: true, between: false, whole: true };
    assert.deepStrictEqual(
      {
        wheel: await inEvery(everyView, wheeled),
        pageDown: await inEvery(everyView, (name) =>
          keyed(name, 'PageDown', 2),
        ),
        scrollbar: await inEvery(everyView, (name) =>
          barHeld(name, () => down(name), 'vertical'),
        ),
        touchpad: await inEvery(everyView, (name) =>
          swiped(name, () => down(name), { deltaY: touched }),
        ),
        wheelAcross: await inEvery(textViews, async (name) => {
          await center(name);
          return pressed(name, true, async () => {
            await page.keyboard.down('Shift');
            await page.mouse.wheel(0, 100);
            await page.keyboard.up('Shift');
          });
        }),
        scrollbarAcross: await inEvery(textViews, (name) =>
          barHeld(name, () => across(name), 'horizontal'),
        ),
      },
      {
        wheel: alike(everyView, landed),
        pageDown: alike(everyView, landed),
        scrollbar: alike(everyView, dragged),
        touchpad: alike(everyView, stepped),
        wheelAcross: alike(textViews, landed),
        scrollbarAcross: alike(textViews, dragged),
      },
    );
  });

  test('leaves every view as it is while all of it fits in the view and scrolling does not glide either', async () => {
    assert.deepStrictEqual(
      await inEveryFitting(fitting),
      alike(everyView, { still: true, thumbs: 0 }),
    );
  });
});
