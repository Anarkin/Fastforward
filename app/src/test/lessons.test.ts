import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';

const sources = path.join(__dirname, '..');

function filesIn(folder: string): string[] {
  return fs
    .readdirSync(path.join(sources, folder), {
      recursive: true,
      encoding: 'utf8',
    })
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => path.join(folder, file).split(path.sep).join('/'))
    .filter((file) => file !== 'test/lessons.test.ts')
    .toSorted();
}

const textOf = (file: string) =>
  fs.readFileSync(path.join(sources, file), 'utf8');

const filesWith = (folder: string, pattern: RegExp) =>
  filesIn(folder).filter((file) => pattern.test(textOf(file)));

const stylesIn = (folder: string) =>
  fs
    .readdirSync(path.join(sources, folder), {
      recursive: true,
      encoding: 'utf8',
    })
    .filter((file) => file.endsWith('.css'))
    .map((file) => path.join(folder, file).split(path.sep).join('/'))
    .toSorted();

const stylesWith = (folder: string, pattern: RegExp) =>
  stylesIn(folder).filter((file) => pattern.test(textOf(file)));

function roundsByItself(css: string): string[] {
  const rounded =
    /(?:border(?:-[a-z]+)*-radius|--scrollbar-round-(?:start|end)|--corner-round)\s*:\s*([^;}]+)/g;
  const allowed =
    /var\(--radius\)|var\(--(?:scrollbar-round-(?:start|end)|corner-round|column-line|popup-line), 0px\)|\binherit\b|50%|\b0(?:px)?\b|\b(?:max|calc)\b|[\s(),-]/g;
  return Array.from(css.matchAll(rounded), ([, value]) => value ?? '').filter(
    (value) => value.replaceAll(allowed, '') !== '',
  );
}

const timesIn = (folder: string, pattern: RegExp) =>
  filesIn(folder).reduce(
    (count, file) => count + (textOf(file).match(pattern)?.length ?? 0),
    0,
  );

const fixedSleeps = 23;

const geometry =
  /getBoundingClientRect|offset(?:Width|Height|Top|Left)|client(?:Width|Height)|scroll(?:Width|Height|Top|Left)/;

const tolerant = /\b(?:withinDevicePixel|menuFit|nextLift)\(/;

function measuresIntoItsOwnState(text: string): number[] {
  const lines: number[] = [];
  let at = text.indexOf('useLayoutEffect(');
  while (at !== -1) {
    const open = text.indexOf('{', at);
    let depth = 0;
    let end = open;
    for (; end < text.length; end++) {
      if (text[end] === '{') {
        depth++;
      } else if (text[end] === '}' && --depth === 0) {
        break;
      }
    }
    const body = text.slice(open, end);
    const deps = (/^\}\s*,\s*\[([^\]]*)\]/.exec(text.slice(end))?.[1] ?? '')
      .split(',')
      .map((name) => name.trim());
    const stores = Array.from(
      body.matchAll(/\bset([A-Z]\w*)\(/g),
      ([, name = '']) => `${name.charAt(0).toLowerCase()}${name.slice(1)}`,
    );
    if (
      geometry.test(body) &&
      stores.some((name) => deps.includes(name)) &&
      !tolerant.test(body)
    ) {
      lines.push(text.slice(0, at).split('\n').length);
    }
    at = text.indexOf('useLayoutEffect(', end);
  }
  return lines;
}

function titlesAnElement(text: string): boolean {
  for (const opened of text.matchAll(/<[a-z][a-z0-9]*(?=[\s/>])/g)) {
    let depth = 0;
    for (let at = opened.index + opened[0].length; at < text.length; at++) {
      const char = text[at];
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
      } else if (depth === 0 && char === '>') {
        break;
      } else if (
        depth === 0 &&
        /\s/.test(text[at - 1] ?? '') &&
        text.startsWith('title=', at)
      ) {
        return true;
      }
    }
  }
  return false;
}

suite('Lessons from past mistakes', () => {
  test('waits for a page to load again in no end-to-end test, as the app loads its pages again only for settings other than those it has and a save of its own under way replaces the settings a test wrote, so a test waited 30 seconds for a page that loaded no more; writeSettings writes them until the page shows them', () => {
    assert.deepStrictEqual(
      filesWith('test/e2e', /waitForEvent\(\s*['"]load['"]/),
      [],
    );
  });

  test('compares what a layout effect measures with what it stored within a device pixel, through menuFit, nextLift or withinDevicePixel, where the effect runs again once that changes, as the browser lays out in 64ths of a device pixel, so at 125% a menu moved into the window measured 0.00006 pixels past its edge at every pass and moving it by that again and again crashed the page; the slot a tab visits is a whole index, and what a diff reveals is only cleared', () => {
    assert.deepStrictEqual(
      ['lib', 'shell', 'tools', 'components'].flatMap((folder) =>
        filesIn(folder).filter(
          (file) => measuresIntoItsOwnState(textOf(file)).length > 0,
        ),
      ),
      ['shell/page/tabVisit.ts', 'components/diff/page/jumps.ts'],
    );
  });

  test('moves and sizes a window in windowPixels alone, which keeps its size to the device pixel on Windows, as Electron rounded the size up at each move or resize on a screen scaled by a fraction, growing a window dragged by its only tab at every step and making a tab torn off a pixel larger than the window it left', () => {
    assert.deepStrictEqual(
      ['boot', 'shell', 'lib', 'tools', 'components'].flatMap((folder) =>
        filesWith(
          folder,
          /\.(?:setPosition|setSize|setBounds|setContentBounds|setContentSize)\(/,
        ),
      ),
      ['boot/windowPixels.ts', 'boot/windowsPixels.ts'],
    );
  });

  test('starts the app of an end-to-end test at a scale by the scale of launchApp alone, which a test asking for one passes rather than FASTFORWARD_TEST_SCALE, as each file named the switch of Chromium itself after the one the variable gave and only the order of the two picked the scale', () => {
    assert.deepStrictEqual(filesWith('test/e2e', /force-device-scale-factor/), [
      'test/e2e/appLaunch.ts',
    ]);
  });

  test('starts the app of an end-to-end test in launchApp alone, which keeps the pointer of the machine out of its windows, as a move of the real pointer took the pointer capture and dropped the tab a test dragged', () => {
    assert.deepStrictEqual(filesWith('test/e2e', /\b_electron\b/), [
      'test/e2e/appLaunch.ts',
    ]);
  });

  test('sets each condition a test depends on everywhere the app reads it, as a page follows its driver and not only its settings', () => {
    assert.deepStrictEqual(
      filesIn('test/e2e').flatMap((file) => {
        const text = textOf(file);
        return Array.from(
          text.matchAll(/\btheme:\s*['"](light|dark)['"]/g),
          ([, theme = '']) => theme,
        )
          .filter((theme) => !text.includes(`colorScheme: '${theme}'`))
          .map((theme) => `${file} ${theme}`);
      }),
      [],
    );
  });

  test('closes the app of an end-to-end test in closeOrKill alone, which answers the app that asks before it quits, as a test closing an app with a terminal tab or an unsaved file waited ten seconds and then stopped it', () => {
    assert.deepStrictEqual(
      filesWith('test', /\b(?:app|launched|electronApp)\.close\(\)/),
      ['test/e2e/appLaunch.ts'],
    );
  });

  test('stops a process by its id on Windows in stopTree alone, which holds the process open meanwhile, as taskkill stopped the process Windows gave the id of one ended by itself to, the next git of the app', () => {
    assert.deepStrictEqual(
      [
        ...filesWith('tools', /taskkill/i),
        ...filesWith('lib', /taskkill/i),
        ...filesWith('boot', /taskkill/i),
        ...filesWith('shell', /taskkill/i),
        ...filesWith('components', /taskkill/i),
      ],
      ['tools/git/main/processTree.ts'],
    );
  });

  test('sleeps for a time of its own choosing in no more places of the end-to-end tests than before, as a time long enough here was too short on a slower machine of CI and a wait for what the page shows needs none; lower the count as a sleep goes', () => {
    assert.strictEqual(
      timesIn(
        'test/e2e',
        /waitForTimeout\(|setTimeout\(\s*resolve,\s*[\d_]+\s*\)/g,
      ),
      fixedSleeps,
    );
  });

  test('measures text with the one range of the page, scratchRange, never with a range made for a measure, as every range made stays tied to the page until it is collected and is moved along at each change of the page, the editor making one a line at each redraw until dropping the lines of a scroll took 40 ms of a step under its scrollbar', () => {
    assert.deepStrictEqual(
      ['tools', 'lib', 'components', 'shell', 'boot'].flatMap((folder) =>
        filesWith(folder, /\bcreateRange\(/),
      ),
      ['lib/page/scratchRange.ts'],
    );
  });

  test('says what a control does, and shows text cut short, in the tooltip of the app, by tip or labelTip, never in the title of an element, as the tooltip of the browser took no path, no key and no setting, looked another way at each scale and would come back with every element that kept its title', () => {
    assert.deepStrictEqual(
      [
        titlesAnElement('<span className="a" title={said}>'),
        titlesAnElement('<svg>\n  <title>said</title>'),
        titlesAnElement('<Menu title={said} />'),
        titlesAnElement(
          '<span {...tip(said)} onClick={() => <b title="x" />}>',
        ),
        titlesAnElement('const kept = useRef<string>(title);'),
      ],
      [true, false, false, true, false],
    );
    const pages = ['tools', 'lib', 'components', 'shell'];
    assert.deepStrictEqual(
      pages.flatMap((folder) =>
        filesIn(folder).filter((file) => titlesAnElement(textOf(file))),
      ),
      [],
    );
    assert.deepStrictEqual(
      pages.flatMap((folder) =>
        filesWith(folder, /<title>|setAttribute\(\s*['"]title['"]/),
      ),
      [],
    );
  });

  test('spaces the buttons of a header by the Toolbar they stand in, never by a spacer or a style of the header: the Toolbar and its ToolbarSpace alone write their classes, the start and the actions of a header are Toolbars, no stylesheet but that of the buttons styles a toolbar, and the tabs of one block, the viewer, the editor and the diff of two files, say so, which stands their buttons outside the frame of the block, as every header had spacers and paddings of its own until its buttons stood apart by different amounts, closer to one edge than another, and moved as a search opened', () => {
    const pages = ['tools', 'lib', 'components', 'shell'];
    assert.deepStrictEqual(
      pages.flatMap((folder) =>
        filesWith(folder, /["'`\s]toolbar(?:-space)?["'`\s$]/),
      ),
      ['lib/page/toolbar.tsx'],
    );
    const ends =
      /<([A-Za-z]\w*)\s+className=\{?["`][^"`]*\bcolumn-(?:start|actions)\b/g;
    const found = pages.flatMap((folder) =>
      filesIn(folder).flatMap((file) =>
        Array.from(textOf(file).matchAll(ends), ([, tag]) => tag),
      ),
    );
    assert.deepStrictEqual([...new Set(found)], ['Toolbar']);
    assert.strictEqual(
      found.length,
      pages.reduce(
        (count, folder) =>
          count + timesIn(folder, /\bcolumn-(?:start|actions)\b/g),
        0,
      ),
    );
    assert.deepStrictEqual(
      pages.flatMap((folder) => stylesWith(folder, /\.toolbar\b/)),
      ['shell/page/buttons.css'],
    );
    const blocks = /className="columns([^"]*)"/g;
    const tools = pages.flatMap((folder) =>
      filesIn(folder).flatMap((file) =>
        Array.from(textOf(file).matchAll(blocks), ([, classes]) => ({
          file,
          single: /\bsingle\b/.test(classes ?? ''),
        })),
      ),
    );
    assert.deepStrictEqual(
      tools.filter((tool) => tool.single).map((tool) => tool.file),
      [
        'tools/diff/page/compareView.tsx',
        'tools/diff/page/tool.tsx',
        'tools/editor/page/tool.tsx',
        'tools/viewer/page/tool.tsx',
      ],
    );
  });

  test('rounds every corner by the one radius of the app: a stylesheet gives a corner the radius, none, the half that makes a dot, or what its element inherits, and the corner of a scrollbar what comes of the radius, as cards, tabs, buttons, fields and marks each had a radius of their own, eleven in all, none of which followed another', () => {
    assert.deepStrictEqual(
      [
        'border-radius: var(--radius);',
        'border-radius: 0 var(--radius) var(--radius) 0;',
        'border-radius: 50%;',
        'border-top-left-radius: inherit;',
        '--corner-round: max(0px, var(--radius) - var(--column-line, 0px));',
        'border-radius: 0 var(--scrollbar-round-start, 0px) 0 0;',
        'border-radius: 4px;',
        'border-radius: calc(var(--button-size) / 2);',
        '--scrollbar-round-end: 6px;',
        'border-radius: var(--card-radius);',
      ].map((rule) => roundsByItself(rule).length),
      [0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
    );
    const pages = ['tools', 'lib', 'components', 'shell'];
    assert.deepStrictEqual(
      pages.flatMap((folder) =>
        stylesIn(folder).flatMap((file) =>
          roundsByItself(textOf(file)).map((value) => `${file}: ${value}`),
        ),
      ),
      [],
    );
    assert.deepStrictEqual(
      pages.flatMap((folder) => stylesWith(folder, /--radius\s*:/)),
      ['shell/page/window.css'],
    );
  });
});
