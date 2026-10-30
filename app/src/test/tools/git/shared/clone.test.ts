import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  cloneName,
  cloneProblem,
  clonableUrl,
  nameProblem,
  targetPath,
  urlProblem,
} from '../../../../tools/git/shared/clone';

suite('Clone', () => {
  test('names the folder after the last part of the URL, without .git, as git does', () => {
    for (const [url, name] of [
      ['git@github.com:Anarkin/Fastforward.git', 'Fastforward'],
      ['https://github.com/Anarkin/Fastforward.git', 'Fastforward'],
      ['https://github.com/Anarkin/Fastforward/', 'Fastforward'],
      ['https://github.com/Anarkin/Fastforward.git/', 'Fastforward'],
      ['ssh://git@example.com:2222/team/app.git', 'app'],
      ['https://dev.azure.com/org/project/_git/service', 'service'],
      ['git@example.com:app', 'app'],
      ['file:///C:/Code/repo', 'repo'],
      ['C:\\Code\\repo\\.git', 'repo'],
      ['/srv/git/repo.git', 'repo'],
      ['  https://example.com/site.git  ', 'site'],
    ]) {
      assert.strictEqual(cloneName(url), name, url);
    }
  });

  test('names no folder when the URL ends in nothing a folder can be named', () => {
    for (const url of ['', '   ', 'https://example.com/a/..', 'git@host:']) {
      assert.strictEqual(cloneName(url), '', url);
    }
  });

  test('refuses URLs of more than one line, that git would take as an option, or that run a command', () => {
    assert.strictEqual(urlProblem('https://example.com/a.git'), undefined);
    assert.strictEqual(
      urlProblem('https://example.com/a.git\nhttps://example.com/b.git'),
      'The URL must be one line',
    );
    assert.strictEqual(
      urlProblem(' --upload-pack=touch x'),
      "The URL can't start with -",
    );
    assert.strictEqual(
      urlProblem('EXT::sh -c touch% x'),
      "ext:: URLs run commands, so they aren't cloned",
    );
  });

  test("refuses names a folder can't have on any system", () => {
    assert.strictEqual(nameProblem('app'), undefined);
    assert.strictEqual(nameProblem('my app.v2'), undefined);
    assert.strictEqual(nameProblem(''), 'Name the folder to clone into');
    for (const name of [
      '.',
      '..',
      'a/b',
      'a\\b',
      'a:b',
      'a?',
      'a*',
      'a"b',
      'a<b>',
      'a|b',
      'a\tb',
      'trailing.',
      'trailing ',
      'con',
      'NUL.txt',
      'com1',
      'LPT9',
    ]) {
      assert.strictEqual(
        nameProblem(name),
        `${name} can't be the name of a folder`,
        JSON.stringify(name),
      );
    }
  });

  test('tells the first problem of a clone asked for, its URL before its name', () => {
    assert.strictEqual(
      cloneProblem({ url: '', folder: '/code', name: 'app' }),
      'Paste the URL of the repository to clone',
    );
    assert.strictEqual(
      cloneProblem({ url: '-x', folder: '/code', name: '..' }),
      "The URL can't start with -",
    );
    assert.strictEqual(
      cloneProblem({ url: 'git@host:app.git', folder: '/code', name: '..' }),
      ".. can't be the name of a folder",
    );
    assert.strictEqual(
      cloneProblem({ url: 'git@host:app.git', folder: '/code', name: 'app' }),
      undefined,
    );
  });

  test('takes a URL from the clipboard only when it is one that clones', () => {
    for (const [text, url] of [
      ['https://github.com/Anarkin/Fastforward.git', undefined],
      [' git@github.com:Anarkin/Fastforward.git\n', undefined],
      ['ssh://git@example.com/app.git', undefined],
      ['git://example.com/app.git', undefined],
      ['http://example.com/app', undefined],
    ] as const) {
      assert.strictEqual(clonableUrl(text), url ?? text.trim(), text);
    }
    for (const text of [
      '',
      'hello world',
      'see https://example.com/app.git',
      'https://example.com/a.git\nhttps://example.com/b.git',
      'C:\\Code\\repo',
      'ext::sh -c touch% x',
    ]) {
      assert.strictEqual(clonableUrl(text), undefined, text);
    }
  });

  test('shows the folder a clone goes into with the separator the folder uses', () => {
    assert.strictEqual(targetPath('C:\\Code', 'app'), 'C:\\Code\\app');
    assert.strictEqual(targetPath('C:\\', 'app'), 'C:\\app');
    assert.strictEqual(targetPath('/home/me', 'app'), '/home/me/app');
    assert.strictEqual(targetPath('/', 'app'), '/app');
  });
});
