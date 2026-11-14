import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  matchesCommit,
  parseSearchedCommit,
  SearchMatches,
  takeRecords,
} from '../../../../../tools/git/main/commitMatches';

suite('Commit search matching', () => {
  const commit = parseSearchedCommit(
    'aaa\0Ada Lovelace\0ada@example.com\0Test\0test@example.com\0Subject\n\nBody about ADA\n',
  );

  test('reads the hash, the author and committer with their emails, and the whole message', () => {
    assert.deepStrictEqual(commit, {
      hash: 'aaa',
      author: 'Ada Lovelace <ada@example.com>',
      committer: 'Test <test@example.com>',
      message: 'Subject\n\nBody about ADA\n',
    });
  });

  test('finds the text in any of them, ignoring case, emails and the description included', () => {
    assert.strictEqual(matchesCommit(commit, 'LOVELACE'), true);
    assert.strictEqual(matchesCommit(commit, 'TEST@'), true);
    assert.strictEqual(matchesCommit(commit, 'body'), true);
    assert.strictEqual(matchesCommit(commit, 'nothing'), false);
  });

  test('folds the text as every find of the page does, so a final sigma and letters composed or not match alike', () => {
    const greek = parseSearchedCommit(
      'bbb\0Ada\0ada@example.com\0Ada\0ada@example.com\0ΟΔΟΣ and élan\n',
    );
    assert.strictEqual(matchesCommit(greek, 'οδοσ'), true);
    assert.strictEqual(matchesCommit(greek, 'ÉLAN'), true);
  });
});

suite('Commit search stream', () => {
  test('cuts the commits by their fields, whatever their messages hold, keeping the unfinished one', () => {
    assert.deepStrictEqual(
      takeRecords(
        'aaa\0A\0a@x\0B\0b@x\0One\x1eline\n\0bbb\0A\0a@x\0B\0b@x\0Two\n\0ccc\0A',
      ),
      {
        records: [
          'aaa\0A\0a@x\0B\0b@x\0One\x1eline\n',
          'bbb\0A\0a@x\0B\0b@x\0Two\n',
        ],
        rest: 'ccc\0A',
      },
    );
  });

  test('takes the commits that match from the one walk of the history, settling at one past the limit without waiting for the rest', () => {
    const matches = new SearchMatches('ada', 2);
    assert.strictEqual(
      matches.add('aaa\0Ada\0a@x\0B\0b@x\0About ada'),
      undefined,
    );
    assert.strictEqual(matches.add('bbb\0B\0b@x\0B\0b@x\0Nothing'), undefined);
    assert.strictEqual(matches.add('ccc\0B\0b@x\0Ada\0a@x\0'), undefined);
    assert.deepStrictEqual(matches.add('ddd\0B\0b@x\0B\0b@x\0ADA'), {
      found: ['aaa', 'ccc'],
      capped: true,
    });
  });

  test('stops at 50 matches unless told another limit, as each search walks every commit', () => {
    const matches = new SearchMatches('ada');
    for (let i = 0; i < 50; i++) {
      assert.strictEqual(matches.add(`h${i}\0Ada\0a@x\0B\0b@x\0`), undefined);
    }
    assert.strictEqual(matches.add('last\0Ada\0a@x\0B\0b@x\0')?.capped, true);
  });

  test('ends after the last commit, with every match in any letters', () => {
    const matches = new SearchMatches('ada', 5);
    matches.add('aaa\0Ada\0a@x\0B\0b@x\0');
    matches.add('bbb\0B\0b@x\0B\0b@x\0Nothing');
    assert.deepStrictEqual(matches.end(), {
      found: ['aaa'],
      capped: false,
    });
    const whole = new SearchMatches('ÉLAN', 5);
    whole.add('aaa\0B\0b@x\0B\0b@x\0élan');
    assert.deepStrictEqual(whole.end(), {
      found: ['aaa'],
      capped: false,
    });
  });
});
