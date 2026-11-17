import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

export const checks = ['format:check', 'lint', 'knip', 'check-types'] as const;

export interface Ended {
  readonly code: number;
  readonly output: string;
}

const listed = new Intl.ListFormat('en-GB', { type: 'conjunction' });

export async function runChecks(
  names: readonly string[],
  run: (name: string) => Promise<Ended>,
): Promise<{ readonly code: number; readonly said: string }> {
  const ended = await Promise.all(
    names.map(async (name) => ({
      name,
      ...(await run(name).catch((error: unknown) => ({
        code: 1,
        output: String(error),
      }))),
    })),
  );
  const failed = ended.filter(({ code }) => code !== 0);
  const passed = ended.filter(({ code }) => code === 0);
  return {
    code: failed.length > 0 ? 1 : 0,
    said: [
      ...failed.flatMap(({ name, output }) => [
        `${name} failed:`,
        ...(output.trim() === '' ? [] : [output.trim()]),
      ]),
      ...(passed.length > 0
        ? [`${listed.format(passed.map(({ name }) => name))} passed`]
        : []),
    ].join('\n'),
  };
}

const npmRun = (name: string): Promise<Ended> =>
  new Promise((resolve, reject) => {
    const child = spawn(`npm run ${name}`, {
      cwd: path.join(import.meta.dirname, '..'),
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? 1, output });
    });
  });

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { code, said } = await runChecks(checks, npmRun);
  console.log(said);
  process.exitCode = code;
}
