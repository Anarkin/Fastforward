import { heavyFiles, type HeavyFile } from './heavyFiles.mts';
import type { PlanBuilder } from './filesPlan.mts';

let made: readonly HeavyFile[] | undefined;

function heavy(): readonly HeavyFile[] {
  made ??= heavyFiles();
  return made;
}

export function versionsOf(name: string): readonly [string, string] {
  const dot = name.lastIndexOf('.');
  const stem = dot === -1 ? name : name.slice(0, dot);
  const extension = dot === -1 ? '' : name.slice(dot);
  return [`perf/${stem}-v1${extension}`, `perf/${stem}-v2${extension}`];
}

export function planHeavy(builder: PlanBuilder): void {
  const { pairs, file, section } = builder;
  const files = heavy();
  section(
    'perf',
    `The heavy files the frames are measured over, each made the worst case of one cost of drawing text, in two versions to compare with Shift+F3 once both are marked: ${files.map(({ name, heavy: why }) => `\`${name}\`, ${why}`).join('; ')}. \`npm run perf -- src/test/perf/heavy.perf.test.ts\` measures the frames of the viewer, the editor, the diff and the git tab over them.`,
  );
  for (const { name, before, after } of files) {
    const [old, changed] = versionsOf(name);
    file(old, before);
    file(changed, after);
    pairs.push([old, changed]);
  }
}
