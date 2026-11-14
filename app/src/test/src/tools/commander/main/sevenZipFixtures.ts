import * as fs from 'node:fs';
import type {
  SevenZip,
  SevenZipRun,
} from '../../../../../tools/commander/main/sevenZip';

export function ran(run: Partial<SevenZipRun>): SevenZip {
  return () =>
    Promise.resolve({ code: 0, output: '', errors: '', ...run } as const);
}

export interface Asked {
  readonly args: readonly string[];
  readonly onOutput: undefined;
  readonly input?: string;
  readonly cwd?: string;
  readonly pipeInto?: readonly string[];
  readonly signal?: AbortSignal;
  readonly list?: string;
}

export const listedBy = (args: readonly string[]) => {
  const list = args.find((arg) => arg.startsWith('-i@'))?.slice(3);
  return list === undefined ? {} : { list: fs.readFileSync(list, 'utf8') };
};
