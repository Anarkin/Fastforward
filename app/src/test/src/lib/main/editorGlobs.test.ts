import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { globMatches } from '../../../../lib/main/editorGlobs';

const matches = (glob: string, file: string) => globMatches(glob, file);

suite('EditorConfig globs', () => {
  test('matches the globs of its sections as EditorConfig does, a name without a slash in any folder and one with a slash from the folder of the file', () => {
    assert.ok(matches('*', 'src/a.ts'));
    assert.ok(matches('*.ts', 'src/deep/a.ts'));
    assert.ok(!matches('*.ts', 'src/a.tsx'));
    assert.ok(matches('{*.cmd,*.bat}', 'run.bat'));
    assert.ok(matches('src/*.ts', 'src/a.ts'));
    assert.ok(!matches('src/*.ts', 'src/deep/a.ts'));
    assert.ok(matches('src/**.ts', 'src/deep/a.ts'));
    assert.ok(matches('file?.txt', 'file1.txt'));
    assert.ok(matches('[ab].txt', 'b.txt'));
    assert.ok(!matches('[!ab].txt', 'b.txt'));
    assert.ok(matches('v{1..3}.txt', 'v2.txt'));
    assert.ok(!matches('v{1..3}.txt', 'v4.txt'));
  });

  test('takes a sign of a glob escaped by a backslash for the character itself, as EditorConfig does, and a brace or a bracket never closed for itself too', () => {
    assert.ok(matches('a\\*b', 'a*b'));
    assert.ok(!matches('a\\*b', 'aab'));
    assert.ok(matches('file\\?.txt', 'file?.txt'));
    assert.ok(!matches('file\\?.txt', 'file1.txt'));
    assert.ok(matches('\\[x].txt', '[x].txt'));
    assert.ok(!matches('\\[x].txt', 'x.txt'));
    assert.ok(matches('\\{a,b}', '{a,b}'));
    assert.ok(matches('{a', '{a'));
    assert.ok(matches('[a', '[a'));
    assert.ok(matches('{src,{lib,test}/deep}/*.ts', 'test/deep/a.ts'));
    assert.ok(!matches('{src,{lib,test}/deep}/*.ts', 'test/a.ts'));
    assert.ok(matches('v{-2..2}.txt', 'v-1.txt'));
    assert.ok(!matches('v{1..3}.txt', 'v01.txt'));
    assert.ok(matches('v{1..20000}.txt', 'v15000.txt'));
    assert.ok(!matches('v{1..20000}.txt', 'v25000.txt'));
    assert.ok(!matches('[!a].txt', 'x/.txt'));
  });

  test('matches a glob of many stars against a long name in time that grows with the name alone, as the globs of a cloned repository run on the main process', () => {
    const started = performance.now();
    const glob = `${'*a'.repeat(11)}*b`;
    assert.ok(!matches(glob, 'a'.repeat(64)));
    assert.ok(matches(glob, `${'a'.repeat(64)}b`));
    assert.ok(!matches('**a**a**a**a**a**a**b', `${'a/'.repeat(200)}c`));
    assert.ok(performance.now() - started < 1000);
  });
});
