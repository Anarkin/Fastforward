import * as assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const stylesheets = [
  'shell/page',
  'components/diff/page',
  'tools/commander/page',
  'tools/terminal/page',
  'tools/git/page',
  'tools/viewer/page',
  'tools/editor/page',
  'tools/diff/page',
].map((folder) => `${folder}/style.css`);

export function stylesheet(): string {
  return stylesheets
    .map(withPartials)
    .join('\n')
    .replaceAll(/^@import [^;]*;$/gm, '');
}

function withPartials(file: string): string {
  return readFileSync(join(__dirname, '../..', file), 'utf8').replaceAll(
    /^@import '\.\/([^']+)';$/gm,
    (_, partial: string) => withPartials(join(dirname(file), partial)),
  );
}

export function policyOfPage(): Map<string, string[]> {
  const page = readFileSync(
    join(__dirname, '../../shell/page/index.html'),
    'utf8',
  );
  const [, policy = ''] =
    /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(page) ?? [];
  return new Map(
    policy.split(';').map((directive) => {
      const [name = '', ...sources] = directive.trim().split(/\s+/);
      return [name, sources];
    }),
  );
}

export function stylesheetPx(pattern: RegExp): number {
  const match = pattern.exec(stylesheet());
  assert.ok(match, String(pattern));
  return Number(match[1]);
}
