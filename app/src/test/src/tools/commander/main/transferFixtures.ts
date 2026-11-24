import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  runTransfer,
  type ClashReply,
  type TransferOptions,
  type TransferPlan,
} from '../../../../../tools/commander/main/transfer';
import type {
  Clash,
  TransferProgress,
} from '../../../../../tools/commander/shared/transfers';

export const past = new Date('2020-02-03T04:05:06Z');

export function write(file: string, text: string): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  fs.utimesSync(file, past, past);
  return file;
}

export function hide(file: string): void {
  if (process.platform === 'win32') {
    execFileSync('attrib', ['+h', file]);
  }
}

export function tree(root: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const name of fs.readdirSync(root, {
    recursive: true,
    encoding: 'utf8',
  })) {
    const each = path.join(root, name);
    const key = name.replaceAll('\\', '/');
    found[key] = fs.lstatSync(each).isDirectory()
      ? '/'
      : fs.readFileSync(each, 'utf8');
  }
  return found;
}

export async function run(
  plan: TransferPlan,
  {
    answers = [],
    ...options
  }: Partial<TransferOptions> & { answers?: ClashReply[] } = {},
) {
  const clashes: Clash[] = [];
  const failures: string[] = [];
  const progress: TransferProgress[] = [];
  const end = await runTransfer(
    plan,
    {
      progress: (each) => progress.push(each),
      clash: (clash) => {
        clashes.push(clash);
        return Promise.resolve(
          answers.shift() ?? { answer: 'stop', all: false },
        );
      },
      failed: (name, reason) => failures.push(`${name}: ${reason}`),
    },
    { stopped: () => false, ...options },
  );
  return { end, clashes, failures, progress };
}

export const crossingDrives = (from: string, to: string) =>
  Promise.reject(
    Object.assign(new Error(`EXDEV: cross-device link, ${from} -> ${to}`), {
      code: 'EXDEV',
    }),
  );
