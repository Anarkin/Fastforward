import { plainPng } from './imageSamples.mts';
import type { PlanBuilder, PlanOptions } from './filesPlan.mts';

export function planThumbnails(
  builder: PlanBuilder,
  options: PlanOptions,
): void {
  const { file, section } = builder;
  const { large } = options;
  section(
    'thumbnails',
    `${large ? 2000 : 200} images of many sizes and colors, to scroll in thumbnails with Mod+2.`,
  );
  for (let i = 0; i < (large ? 2000 : 200); i++) {
    file(`thumbnails/image-${String(i + 1).padStart(4, '0')}.png`, () =>
      plainPng(48 + ((i * 37) % 400), 48 + ((i * 53) % 300), (i * 47) % 360),
    );
  }
}

export function planFolders(builder: PlanBuilder, options: PlanOptions): void {
  const { items, file, section } = builder;
  const { large } = options;
  const manyFiles = large ? 100_000 : 6000;
  section(
    'many',
    `${manyFiles.toLocaleString('en-US')} files in one folder, read a page at a time.`,
  );
  for (let i = 0; i < manyFiles; i++) {
    file(`many/file-${String(i + 1).padStart(6, '0')}.txt`, '');
  }

  const [fanOut, depth, perFolder] = large ? [6, 5, 10] : [5, 4, 5];
  section(
    'deep',
    `A tree ${depth} folders deep, ${fanOut} folders wide and ${perFolder} files in each, each named after the folders above it, of many sizes and dates, to list flat with Ctrl+B, sort and stop with Esc.`,
  );
  let grown = 0;
  const grow = (under: string, trail: string, level: number) => {
    for (let k = 0; k < perFolder; k++) {
      grown++;
      file(
        `${under}/file-${trail}${k + 1}.${['txt', 'ts', 'md', 'png', 'json'][k % 5]}`,
        'x'.repeat((grown * 7919) % 4096),
        {
          modified: new Date(
            2020 + (grown % 7),
            grown % 12,
            1 + (grown % 28),
            grown % 24,
            grown % 60,
          ),
        },
      );
    }
    if (level < depth) {
      for (let k = 0; k < fanOut; k++) {
        grow(
          `${under}/folder-${trail}${k + 1}`,
          `${trail}${k + 1}-`,
          level + 1,
        );
      }
    }
  };
  grow('deep', '', 1);

  section(
    'repository',
    'A git repository of its own, marked by the git icon, opened in a git tab with Shift+Enter; the other folders are in none, where the menu offers Clone... and Init.',
  );
  file('repository/README.md', '# A repository inside the playground\n');
  file('repository/main.ts', 'export const inside = "a repository";\n');
  items.push({ kind: 'repository', path: 'repository' });

  section(
    'churn',
    'Changed every half second while the script runs with --churn: files added, grown, renamed and deleted, to watch the commander follow.',
  );
  file(
    'churn/README.txt',
    'This folder stays as it is until the playground script runs with --churn:\n\n    npm run playground:files -- --churn\n\nIt then keeps the playground and changes this folder every half second, adding a file, growing growing.log, renaming a file back and forth and deleting the oldest added, until stopped with Ctrl+C, to watch the commander follow, in a folder and in flat view.\n',
  );
}
