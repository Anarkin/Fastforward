import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, beforeEach, suite, test } from 'vitest';
import { closeOrKill, launchApp } from './appFixtures';
import { waitFor } from './fixtures';
import { removeFolder, tempFolder } from './repositories';

suite('App editor', () => {
  let folder: string;
  let opened: string;
  let profile: string;
  let app: ElectronApplication;
  let page: Page;

  const right = () => page.locator('.commander-pane').nth(1);
  const content = () => page.locator('.editor .cm-content');
  const activeTab = () => page.locator('.tabs .tab.active');
  const editedText = () =>
    content().evaluate((element) =>
      Array.from(
        element.querySelectorAll('.cm-line'),
        (line) => line.textContent ?? '',
      ).join('\n'),
    );
  const select = async (file: string) => {
    const name = file.replace(/\.[^.]*$/, '');
    await right().locator('.commander-row', { hasText: name }).first().click();
    await waitFor(
      async () =>
        (
          await right().locator('.commander-row.selected').textContent()
        )?.includes(name) === true,
      `${name} to be selected`,
    );
  };
  const backToCommander = async () => {
    await page.locator('.tabs [role="tab"]').first().click();
    await right().locator('.commander-row').first().waitFor();
  };
  const edit = async (name: string) => {
    await select(name);
    await page.keyboard.press('F4');
    await content().waitFor();
  };
  const toStart = () =>
    content()
      .locator('.cm-line')
      .first()
      .click({ position: { x: 0, y: 2 } });
  const toEnd = async () => {
    await content().locator('.cm-line').last().click();
    await page.keyboard.press('End');
  };
  const activeIndex = () =>
    page
      .locator('.tabs [role="tab"]')
      .evaluateAll((tabs) =>
        tabs.findIndex((tab) => tab.classList.contains('active')),
      );
  const topLine = () =>
    page.locator('.editor .cm-scroller').evaluate((scroller) => {
      const top = scroller.getBoundingClientRect().top;
      return (
        Array.from(scroller.querySelectorAll('.cm-line')).find(
          (line) => line.getBoundingClientRect().bottom > top + 1,
        )?.textContent ?? ''
      );
    });
  const notices = () => page.locator('.notice').allTextContents();
  const closeNotices = async () => {
    const close = page.locator('.notice-close').first();
    while ((await close.count()) > 0) {
      await close.click({ timeout: 1000 }).catch(() => undefined);
    }
  };

  beforeAll(async () => {
    folder = tempFolder('app-editor');
    profile = path.join(folder, 'profile');
    opened = path.join(folder, 'opened');
    fs.mkdirSync(path.join(opened, 'folder'), { recursive: true });
    fs.writeFileSync(path.join(opened, 'notes.txt'), 'one\r\ntwo\r\n');
    fs.writeFileSync(
      path.join(opened, 'mixed.txt'),
      Buffer.from('caf\xe9\nline\r\nend', 'latin1'),
    );
    fs.writeFileSync(path.join(opened, 'image.bin'), Buffer.alloc(64));
    fs.writeFileSync(
      path.join(opened, 'code.ts'),
      'const a = 1;\nlet b = 2;\n',
    );
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [{ id: '1', tool: 'commander', root: opened }],
        activeTab: '1',
      }),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({ scrolling: { smooth: true } }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await right().locator('.commander-row').first().waitFor();
  });

  beforeEach(async () => {
    await closeNotices();
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  test('opens the file selected on F4 in an editor tab of its own named after it, its text in the editor, and goes back to that tab on F4 again rather than opening another', async () => {
    await edit('notes.txt');
    assert.strictEqual(
      await activeTab().locator('.tab-name').textContent(),
      'notes.txt',
    );
    await waitFor(
      async () => (await editedText()) === 'one\ntwo\n',
      'the text',
    );
    const tabs = await page.locator('.tabs [role="tab"]').count();
    await backToCommander();
    await edit('notes.txt');
    assert.strictEqual(await page.locator('.tabs [role="tab"]').count(), tabs);
    assert.strictEqual(
      await activeTab().locator('.tab-name').textContent(),
      'notes.txt',
    );
    const saved: unknown = JSON.parse(
      fs.readFileSync(path.join(profile, 'state.json'), 'utf8'),
    );
    assert.ok(
      JSON.stringify(saved).includes('"edit":true'),
      JSON.stringify(saved),
    );
  });

  test('marks the tab of a file once edited, saves it on Ctrl+S byte for byte, with the line endings and the bytes it cannot decode as they were, and unmarks the tab', async () => {
    await backToCommander();
    await edit('mixed.txt');
    await waitFor(
      async () => (await editedText()).startsWith('caf'),
      'the text',
    );
    await toStart();
    await page.keyboard.type('> ');
    await activeTab().locator('.tab-unsaved').waitFor();
    await page.keyboard.press('ControlOrMeta+S');
    await activeTab().locator('.tab-unsaved').waitFor({ state: 'detached' });
    assert.strictEqual(
      fs.readFileSync(path.join(opened, 'mixed.txt')).toString('latin1'),
      '> caf\xe9\nline\r\nend',
    );
  });

  test('keeps the text edited and its undo history while the page reloads as the settings are saved', async () => {
    await backToCommander();
    await edit('notes.txt');
    await toEnd();
    await page.keyboard.type('three');
    await activeTab().locator('.tab-unsaved').waitFor();
    await waitFor(
      async () => (await editedText()) === 'one\ntwo\nthree',
      'the edit',
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    const reloaded = page.waitForEvent('load');
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({ scrolling: { smooth: true }, dateFormat: 'YYYY-MM-DD' }),
    );
    await reloaded;
    await content().waitFor();
    await waitFor(
      async () => (await editedText()) === 'one\ntwo\nthree',
      'the edit kept',
    );
    await activeTab().locator('.tab-unsaved').waitFor();
    await content().click();
    await page.keyboard.press('ControlOrMeta+Z');
    await waitFor(
      async () => (await editedText()) === 'one\ntwo\n',
      'the edit undone',
    );
    await activeTab().locator('.tab-unsaved').waitFor({ state: 'detached' });
  });

  test("asks whether to save the changes of a tab before closing it, saving them on Save and leaving the file as it was on Don't Save", async () => {
    const file = path.join(opened, 'notes.txt');
    const before = fs.readFileSync(file, 'latin1');
    const tabs = () => page.locator('.tabs [role="tab"]').count();
    const typeAndClose = async (typed: string) => {
      await backToCommander();
      await edit('notes.txt');
      await toStart();
      await page.keyboard.type(typed);
      await activeTab().locator('.tab-unsaved').waitFor();
      await activeTab().locator('.tab-close').click();
      await page.locator('.confirm-popup').waitFor();
    };
    const count = await tabs();
    await typeAndClose('x');
    assert.match(
      (await page.locator('.confirm-popup').textContent()) ?? '',
      /Save the changes to this file before closing it\?.*notes\.txt/,
    );
    await page.locator('.confirm-button.default').click();
    await waitFor(async () => (await tabs()) === count - 1, 'the tab closed');
    assert.strictEqual(fs.readFileSync(file, 'latin1'), `x${before}`);
    await typeAndClose('y');
    await page.locator('.confirm-button', { hasText: "Don't Save" }).click();
    await waitFor(async () => (await tabs()) === count - 1, 'the tab closed');
    assert.strictEqual(fs.readFileSync(file, 'latin1'), `x${before}`);
  });

  test('edits a new file named on Shift+F4 as empty text, making the file only once it is saved', async () => {
    await backToCommander();
    const file = path.join(opened, 'fresh.txt');
    await right().locator('.commander-row').first().click();
    await page.keyboard.press('Shift+F4');
    const prompt = page.locator('.prompt-input');
    await prompt.waitFor();
    await prompt.fill('fresh.txt');
    await prompt.press('Enter');
    await content().waitFor();
    assert.strictEqual(
      await activeTab().locator('.tab-name').textContent(),
      'fresh.txt',
    );
    assert.strictEqual(fs.existsSync(file), false);
    await content().click();
    await page.keyboard.type('hello');
    await activeTab().locator('.tab-unsaved').waitFor();
    await page.keyboard.press('ControlOrMeta+S');
    await activeTab().locator('.tab-unsaved').waitFor({ state: 'detached' });
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'hello');
  });

  test('reads a file changed on disk again while it has no changes in the editor, and asks before saving changes over a file changed on disk since', async () => {
    const file = path.join(opened, 'outside.txt');
    fs.writeFileSync(file, 'first\n');
    await backToCommander();
    await waitFor(
      async () =>
        (await right()
          .locator('.commander-row', { hasText: 'outside' })
          .count()) > 0,
      'the file listed',
    );
    await edit('outside.txt');
    await waitFor(async () => (await editedText()) === 'first\n', 'the text');
    fs.writeFileSync(file, 'second\n');
    await waitFor(
      async () => (await editedText()) === 'second\n',
      'the text read again',
    );
    await toStart();
    await page.keyboard.type('mine ');
    await activeTab().locator('.tab-unsaved').waitFor();
    fs.writeFileSync(file, 'third\n');
    await waitFor(
      async () =>
        (await notices()).some((notice) => notice.includes('changed on disk')),
      'a notice of the change',
    );
    assert.strictEqual(await editedText(), 'mine second\n');
    await page.keyboard.press('ControlOrMeta+S');
    await page
      .locator('.confirm-popup', { hasText: 'Changed on Disk' })
      .waitFor();
    await page.locator('.confirm-button.default').click();
    await activeTab().locator('.tab-unsaved').waitFor({ state: 'detached' });
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'mine second\n');
  });

  test('colors the code edited by its language as the viewer does, coloring again as it is typed', async () => {
    await backToCommander();
    await edit('code.ts');
    const keywords = content()
      .locator('.cm-line')
      .first()
      .locator('.syntax-keyword');
    await keywords.first().waitFor();
    assert.strictEqual(await keywords.first().textContent(), 'const');
    await toStart();
    await page.keyboard.type('// ');
    await waitFor(
      async () =>
        (
          await content()
            .locator('.cm-line')
            .first()
            .locator('.syntax-comment')
            .allTextContents()
        ).join('') === '// const a = 1;',
      'the line colored as a comment',
    );
    await content()
      .locator('.cm-line')
      .nth(1)
      .locator('.syntax-keyword')
      .first()
      .waitFor();
  });

  test('shows a file of mixed line endings as Mixed and converts every line of it to the one chosen, saving it so, and saves a file read in a code page in the encoding chosen', async () => {
    const endings = path.join(opened, 'endings.txt');
    const latin = path.join(opened, 'latin.txt');
    fs.writeFileSync(endings, 'a\r\nb\nc\r\n');
    fs.writeFileSync(latin, Uint8Array.of(0x63, 0x61, 0x66, 0xe9, 0x0a));
    const trigger = (label: RegExp) =>
      page.locator('.editor .menu-button-trigger', { hasText: label });
    await backToCommander();
    await waitFor(
      async () =>
        (await right()
          .locator('.commander-row', { hasText: 'latin' })
          .count()) > 0,
      'the files listed',
    );
    await edit('endings.txt');
    const endingsButton = trigger(/^Mixed$/);
    await endingsButton.waitFor();
    await endingsButton.click();
    await page.locator('.menu-item', { hasText: 'Convert to CRLF' }).click();
    await trigger(/^CRLF$/).waitFor();
    await activeTab().locator('.tab-unsaved').waitFor();
    await page.keyboard.press('ControlOrMeta+S');
    await activeTab().locator('.tab-unsaved').waitFor({ state: 'detached' });
    assert.strictEqual(fs.readFileSync(endings, 'latin1'), 'a\r\nb\r\nc\r\n');

    await backToCommander();
    await edit('latin.txt');
    await page
      .locator('.editor .menu-button-trigger[title="Encoding"]')
      .click();
    await page
      .locator('.menu-item', { hasText: /^UTF-8$/ })
      .first()
      .click();
    await page
      .locator('.editor .menu-button-trigger[title="Encoding"]', {
        hasText: /→ UTF-8$/,
      })
      .waitFor();
    await page.keyboard.press('ControlOrMeta+S');
    await activeTab().locator('.tab-unsaved').waitFor({ state: 'detached' });
    assert.deepStrictEqual(
      [...fs.readFileSync(latin)],
      [0x63, 0x61, 0x66, 0xc3, 0xa9, 0x0a],
    );
  });

  test('indents on Tab, comments a line out on Ctrl+K, moves it on Alt+Down, goes to a line on Ctrl+G and types at every occurrence Ctrl+D selected, telling the line, column and cursors below', async () => {
    fs.writeFileSync(path.join(opened, 'keys.ts'), 'let a = 1;\nlet b = 2;\n');
    const status = () =>
      page.locator('.editor .column-status-text').textContent();
    await backToCommander();
    await waitFor(
      async () =>
        (await right().locator('.commander-row', { hasText: 'keys' }).count()) >
        0,
      'the file listed',
    );
    await edit('keys.ts');
    await waitFor(
      async () => (await editedText()).startsWith('let a'),
      'the text',
    );
    await toStart();
    await waitFor(async () => (await status()) === 'Ln 1, Col 1', 'the place');
    await page.keyboard.press('Tab');
    await waitFor(async () => (await status()) === 'Ln 1, Col 5', 'the indent');
    await page.keyboard.press('ControlOrMeta+K');
    await page.keyboard.press('Alt+ArrowDown');
    await waitFor(
      async () => (await editedText()) === 'let b = 2;\n    // let a = 1;\n',
      'the line commented out and moved down',
    );
    await page.keyboard.press('Control+G');
    const prompt = page.locator('.prompt-input');
    await prompt.waitFor();
    await prompt.fill('1');
    await prompt.press('Enter');
    await waitFor(async () => (await status()) === 'Ln 1, Col 1', 'line 1');
    await page.keyboard.press('ControlOrMeta+D');
    await page.keyboard.press('ControlOrMeta+D');
    await waitFor(
      async () => (await status())?.includes('2 cursors') === true,
      'two cursors',
    );
    await page.keyboard.type('const');
    await waitFor(
      async () =>
        (await editedText()) === 'const b = 2;\n    // const a = 1;\n',
      'both occurrences typed over',
    );
    await page.keyboard.press('Escape');
    await waitFor(
      async () => (await status())?.includes('cursors') === false,
      'one cursor',
    );
  });

  test('finds the text typed on Ctrl+F, going to the next match on Enter, and replaces every match on Ctrl+H', async () => {
    fs.writeFileSync(path.join(opened, 'find.txt'), 'one two one\nthree one\n');
    await backToCommander();
    await waitFor(
      async () =>
        (await right().locator('.commander-row', { hasText: 'find' }).count()) >
        0,
      'the file listed',
    );
    await edit('find.txt');
    await waitFor(
      async () => (await editedText()).startsWith('one'),
      'the text',
    );
    await toStart();
    await page.keyboard.press('ControlOrMeta+F');
    const field = page.locator('.editor .find-field .find-field-input');
    await field.waitFor();
    await field.fill('one');
    const count = page.locator('.editor .find-field-count');
    await waitFor(
      async () => (await count.textContent()) === '1 of 3',
      'the first match',
    );
    await field.press('Enter');
    await waitFor(
      async () => (await count.textContent()) === '2 of 3',
      'the next match',
    );
    assert.strictEqual(await content().locator('.find-match').count(), 3);
    await field.press('Control+H');
    const replacing = page.locator('.editor-replace-input');
    await replacing.waitFor();
    await replacing.fill('ONE');
    await page
      .locator('.editor-replace .confirm-button', { hasText: 'Replace All' })
      .click();
    await waitFor(
      async () => (await editedText()) === 'ONE two ONE\nthree ONE\n',
      'every match replaced',
    );
    await field.press('Escape');
    await page
      .locator('.editor .find-field .find-field-input')
      .waitFor({ state: 'detached' });
  });

  test('ends the lines of a new file as the .editorconfig beside it says', async () => {
    fs.writeFileSync(
      path.join(opened, '.editorconfig'),
      '[*.crlf.txt]\nend_of_line = crlf\n',
    );
    const file = path.join(opened, 'made.crlf.txt');
    await backToCommander();
    await right().locator('.commander-row').first().click();
    await page.keyboard.press('Shift+F4');
    const prompt = page.locator('.prompt-input');
    await prompt.waitFor();
    await prompt.fill('made.crlf.txt');
    await prompt.press('Enter');
    await content().waitFor();
    await content().click();
    await page.keyboard.type('one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    await activeTab().locator('.tab-unsaved').waitFor();
    await page.keyboard.press('ControlOrMeta+S');
    await activeTab().locator('.tab-unsaved').waitFor({ state: 'detached' });
    assert.strictEqual(fs.readFileSync(file, 'latin1'), 'one\r\ntwo');
  });

  test('lists where the line ending of new lines and the encoding come from in their menus, and edits the .editorconfig one comes from once its row is clicked', async () => {
    const config = path.join(opened, '.editorconfig');
    fs.writeFileSync(
      config,
      '[*.crlf.txt]\nend_of_line = crlf\n[sourced.txt]\nend_of_line = lf\n',
    );
    fs.writeFileSync(path.join(opened, 'sourced.txt'), 'a\r\nb\r\n');
    await backToCommander();
    await edit('sourced.txt');
    const items = page.locator('.menu-item');
    await page
      .locator('.editor .menu-button-trigger[title="Encoding"]')
      .click();
    await items.filter({ hasText: 'UTF-8, as its bytes are UTF-8' }).waitFor();
    await page.keyboard.press('Escape');
    await page
      .locator('.editor .menu-button-trigger', { hasText: /^CRLF$/ })
      .click();
    const fromConfig = `LF, from end_of_line in ${config}`;
    await waitFor(
      async () =>
        (await items.allTextContents()).some((text) =>
          text.endsWith(fromConfig),
        ),
      'the .editorconfig among the sources',
    );
    const texts = await items.allTextContents();
    assert.ok(
      texts.some((text) =>
        text.endsWith('CRLF, as most lines of the file end'),
      ),
      texts.join('\n'),
    );
    assert.ok(
      texts.some((text) =>
        text.endsWith('LF, from editor.endOfLine in the settings'),
      ),
      texts.join('\n'),
    );
    await items.filter({ hasText: fromConfig }).click();
    await waitFor(
      async () =>
        (await activeTab().locator('.tab-name').textContent()) ===
        '.editorconfig',
      'the .editorconfig in a tab of its own',
    );
    await waitFor(
      async () => (await editedText()).includes('[sourced.txt]'),
      'the .editorconfig edited',
    );
  });

  test('trims the whitespace at the end of the lines edited and ends the file with a line break as saved where the .editorconfig says so, leaving the lines not edited as they were', async () => {
    fs.writeFileSync(
      path.join(opened, '.editorconfig'),
      '[trimmed.txt]\ntrim_trailing_whitespace = true\ninsert_final_newline = true\n',
    );
    const file = path.join(opened, 'trimmed.txt');
    fs.writeFileSync(file, 'keep  \r\nlast');
    await backToCommander();
    await edit('trimmed.txt');
    await waitFor(
      async () => (await editedText()) === 'keep  \nlast',
      'the text',
    );
    await toEnd();
    await page.keyboard.type(' word  ');
    await activeTab().locator('.tab-unsaved').waitFor();
    await page.keyboard.press('ControlOrMeta+S');
    await activeTab().locator('.tab-unsaved').waitFor({ state: 'detached' });
    assert.strictEqual(
      fs.readFileSync(file, 'latin1'),
      'keep  \r\nlast word\r\n',
    );
  });

  test('shows the whitespace once its button is pressed, the spaces dotted, the tabs signed and a sign after each line that ends in CRLF, and hides it again', async () => {
    fs.writeFileSync(path.join(opened, 'blanks.txt'), 'a  b\r\nc\td\n e\r\n');
    await backToCommander();
    await edit('blanks.txt');
    await waitFor(
      async () => (await editedText()) === 'a  b\nc\td\n e\n',
      'the text',
    );
    const toggle = page.locator('.editor button[title="Show Whitespace"]');
    await toggle.click();
    try {
      await content().locator('.spaces').first().waitFor();
      assert.strictEqual(
        await content().locator('.blank[data-glyph="→"]').count(),
        1,
      );
      const signed = await content()
        .locator('.cm-line')
        .evaluateAll((lines) =>
          lines.map((line) => line.querySelector('.ending-sign') !== null),
        );
      assert.deepStrictEqual(signed, [true, false, true, false]);
    } finally {
      await toggle.click();
    }
    await content().locator('.spaces').first().waitFor({ state: 'detached' });
    assert.strictEqual(await content().locator('.ending-sign').count(), 0);
  });

  test('marks the bracket matching the one beside the cursor, and one matching none', async () => {
    fs.writeFileSync(path.join(opened, 'brackets.txt'), 'call(a[0])\nopen(\n');
    await backToCommander();
    await edit('brackets.txt');
    await waitFor(
      async () => (await editedText()) === 'call(a[0])\nopen(\n',
      'the text',
    );
    await content().locator('.cm-line').first().click();
    await page.keyboard.press('End');
    await waitFor(
      async () =>
        (await content().locator('.cm-matchingBracket').allTextContents()).join(
          '',
        ) === '()',
      'the brackets around the call matched',
    );
    await content().locator('.cm-line').nth(1).click();
    await page.keyboard.press('End');
    await content().locator('.cm-nonmatchingBracket').waitFor();
  });

  test('turns the tab of a file viewed into one editing it on F4, in its place among the tabs, the cursor on the line the viewer showed at its top', async () => {
    const lines = Array.from({ length: 400 }, (_, at) => `line ${at + 1}`);
    fs.writeFileSync(path.join(opened, 'long.txt'), `${lines.join('\n')}\n`);
    await backToCommander();
    await select('long.txt');
    await page.keyboard.press('F3');
    const rows = page.locator('.viewer .viewer-rows .viewer-row');
    await rows.first().waitFor();
    const tabs = await page.locator('.tabs [role="tab"]').count();
    const viewerTab = await activeIndex();
    await page.keyboard.press('End');
    await rows.filter({ hasText: 'line 400' }).waitFor();
    let shownTop = '';
    await waitFor(async () => {
      const was = shownTop;
      shownTop = (await rows.first().textContent()) ?? '';
      await new Promise((resolve) => setTimeout(resolve, 200));
      return shownTop === was;
    }, 'the viewer to stop scrolling');
    const top = /line (\d+)/.exec(shownTop);
    assert.ok(top !== null);
    await page.keyboard.press('F4');
    await content().waitFor();
    await waitFor(
      async () =>
        (await page.locator('.editor .column-status-text').textContent()) ===
        `Ln ${top[1]}, Col 1`,
      'the cursor on the line the viewer showed',
    );
    assert.strictEqual(await page.locator('.tabs [role="tab"]').count(), tabs);
    assert.strictEqual(await activeIndex(), viewerTab);
    await waitFor(
      async () => (await topLine()) === `line ${top[1]}`,
      'the line at the top of the editor',
    );
  });

  test('says why it opens no editor for a folder or a file of binary data', async () => {
    await backToCommander();
    const tabs = await page.locator('.tabs [role="tab"]').count();
    await select('folder');
    await page.keyboard.press('F4');
    await waitFor(
      async () =>
        (await notices()).some((notice) => notice.includes('is a folder')),
      'a notice about the folder',
    );
    await select('image.bin');
    await page.keyboard.press('F4');
    await waitFor(
      async () =>
        (await notices()).some((notice) => notice.includes('binary data')),
      'a notice about the binary file',
    );
    assert.strictEqual(await page.locator('.tabs [role="tab"]').count(), tabs);
  });
});
