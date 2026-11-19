import * as fs from 'node:fs';
import * as path from 'node:path';
import { tempRepository } from '../helpers/repositories';
import { tempFolder } from '../helpers/tempFolders';
import { pdfOf } from './pdfs';

export const barSize = 24;

const lines = (changed: boolean) =>
  Array.from(
    { length: 400 },
    (_, row) =>
      `line ${row}${changed && row % 50 === 7 ? ' changed' : ''} ${'of words that reach far past the right edge of the window '.repeat(6)}end`,
  ).join('\n');

export const settingsWith = (smooth: boolean, wordWrap = false) => ({
  scrolling: { smooth },
  sizes: { scrollbar: `${barSize}px` },
  text: { wordWrap },
});

export async function scrollbarProfile(): Promise<string> {
  const folder = tempFolder('scrollbars');
  const profile = path.join(folder, 'profile');
  const opened = path.join(folder, 'opened');
  fs.mkdirSync(profile, { recursive: true });
  fs.mkdirSync(opened);
  for (let index = 0; index < 400; index++) {
    fs.writeFileSync(path.join(opened, `file-${index}.txt`), '');
  }
  const one = path.join(folder, 'one.txt');
  const two = path.join(folder, 'two.txt');
  fs.writeFileSync(one, lines(false));
  fs.writeFileSync(two, lines(true));
  const markdown = path.join(folder, 'long.md');
  fs.writeFileSync(
    markdown,
    [
      `    ${'code that reaches far past the right edge '.repeat(12)}`,
      [
        `| ${Array.from({ length: 40 }, (_, index) => `column ${index}`).join(' | ')} |`,
        `| ${Array.from({ length: 40 }, () => '---').join(' | ')} |`,
        `| ${Array.from({ length: 40 }, (_, index) => `a cell ${index}`).join(' | ')} |`,
      ].join('\n'),
      ...Array.from({ length: 200 }, (_, index) => `Paragraph ${index}.`),
    ].join('\n\n'),
  );
  const pdf = path.join(folder, 'long.pdf');
  fs.writeFileSync(
    pdf,
    pdfOf(Array.from({ length: 6 }, (_, index) => [`Page ${index}`])),
  );
  const repository = await tempRepository(path.join(folder, 'repository'));
  await repository.git('commit', '--allow-empty', '-m', 'start');
  for (let index = 0; index < 60; index++) {
    await repository.git('branch', `topic/branch-${index}`);
  }
  for (let index = 0; index < 120; index++) {
    await repository.git('commit', '--allow-empty', '-m', `step ${index}`);
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
        { id: '6', tool: 'viewer', root: markdown },
        { id: '7', tool: 'viewer', root: pdf },
      ],
      activeTab: '1',
    }),
  );
  fs.writeFileSync(
    path.join(profile, 'settings.user.json'),
    JSON.stringify(settingsWith(true)),
  );
  return profile;
}
