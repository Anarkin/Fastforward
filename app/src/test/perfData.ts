import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

const version = 1;

export const perfBuild = path.resolve(
  __dirname,
  '..',
  '..',
  process.env.FASTFORWARD_PERF_BUILD ?? 'perf-build',
);

export interface PerfData {
  readonly repository: string;
  readonly files: string;
  readonly flood: string;
}

export const hugeFile = 'huge.ts';
export const reworkSubject = 'Rework the huge file';
export const manyFolder = 'many';
export const imagesFolder = 'images';
export const logFile = 'big.log';
export const codeFile = 'code.ts';
export const floodReady = 'ready';
export const floodDone = 'done';

function sourceLines(count: number, variant = 0): string[] {
  const lines: string[] = [];
  for (let block = 0; lines.length < count; block++) {
    const changed = variant > 0 && block % 10 === 3;
    const scale = changed ? block % 11 : block % 7;
    lines.push(
      `export function handler${block}(input: Record<string, number>, scale = ${scale}): number {`,
      `  const total = Object.values(input).reduce((sum, value) => sum + value * scale, 0); // ${'note '.repeat(block % 30)}`,
      changed
        ? `  return total >= ${block} ? Math.round(total / ${block + 1}) : total;`
        : `  return total > ${block} ? total - ${block} : total + ${block};`,
      '}',
    );
  }
  return lines.slice(0, count);
}

function commitData(text: string): string {
  return `data ${Buffer.byteLength(text)}\n${text}\n`;
}

function author(time: number): string {
  return `committer Perf <perf@example.com> ${time} +0000\n`;
}

function historyStream(commits: number): string {
  const parts: string[] = [];
  let mark = 0;
  let main = 0;
  let time = 1_600_000_000;
  const onMain = (message: string, file: string, content: string) => {
    mark++;
    time += 60;
    parts.push(
      `commit refs/heads/main\nmark :${mark}\n${author(time)}${commitData(message)}${main > 0 ? `from :${main}\n` : ''}M 100644 inline ${file}\n${commitData(content)}`,
    );
    main = mark;
  };
  for (let index = 0; index < commits; index++) {
    if (index % 8 !== 7 || main === 0) {
      onMain(
        `Change ${index} of the main line`,
        `src/file${index % 200}.ts`,
        `export const value${index} = ${index};\n`,
      );
      continue;
    }
    let side = main;
    for (let step = 0; step < 3; step++) {
      mark++;
      parts.push(
        `commit refs/heads/side${index % 5}\nmark :${mark}\n${author(time + step)}${commitData(`Side work ${index}.${step}`)}from :${side}\nM 100644 inline side/${index % 50}.txt\n${commitData(`side ${index} ${step}\n`)}`,
      );
      side = mark;
    }
    mark++;
    time += 60;
    parts.push(
      `commit refs/heads/main\nmark :${mark}\n${author(time)}${commitData(`Merge side work ${index}`)}from :${main}\nmerge :${side}\n`,
    );
    main = mark;
  }
  onMain('Add the huge file', hugeFile, `${sourceLines(20_000).join('\n')}\n`);
  onMain(reworkSubject, hugeFile, `${sourceLines(20_000, 1).join('\n')}\n`);
  return parts.join('');
}

function git(cwd: string, args: readonly string[], input?: string): void {
  const result = spawnSync('git', ['-C', cwd, ...args], {
    input,
    maxBuffer: 1 << 30,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    },
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
}

function makeRepository(root: string): void {
  fs.mkdirSync(root, { recursive: true });
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['fast-import', '--quiet'], historyStream(40_000));
  git(root, ['reset', '-q', '--hard', 'main']);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, check]);
}

function gradientPng(size: number, hue: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(2, 9);
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    for (let x = 0; x < size; x++) {
      const at = row + 1 + x * 3;
      raw[at] = (hue * 37 + x) & 255;
      raw[at + 1] = (hue * 91 + y) & 255;
      raw[at + 2] = (hue * 13 + x + y) & 255;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const extensions = [
  'ts',
  'js',
  'md',
  'json',
  'png',
  'zip',
  'exe',
  'txt',
  'css',
  'html',
];

function makeFiles(root: string): void {
  const many = path.join(root, manyFolder);
  fs.mkdirSync(many, { recursive: true });
  for (let index = 0; index < 20_000; index++) {
    const extension = extensions[index % extensions.length] ?? 'txt';
    fs.writeFileSync(
      path.join(many, `file-${String(index).padStart(5, '0')}.${extension}`),
      'x'.repeat(index % 100),
    );
  }
  const images = path.join(root, imagesFolder);
  fs.mkdirSync(images, { recursive: true });
  for (let index = 0; index < 1000; index++) {
    fs.writeFileSync(
      path.join(images, `image-${String(index).padStart(4, '0')}.png`),
      gradientPng(256, index),
    );
  }
  const log = fs.openSync(path.join(root, logFile), 'w');
  for (let batch = 0; batch < 300; batch++) {
    const lines: string[] = [];
    for (let line = 0; line < 1000; line++) {
      const index = batch * 1000 + line;
      lines.push(
        `2026-11-13T10:${String(Math.floor(index / 6000) % 60).padStart(2, '0')}:00.${String(index % 1000).padStart(3, '0')}Z INFO  [worker-${index % 8}] Processed request ${(index * 7919) % 100_000} in ${index % 97} ms path=/api/items/${index}\n`,
      );
    }
    fs.writeSync(log, lines.join(''));
  }
  fs.closeSync(log);
  fs.writeFileSync(
    path.join(root, codeFile),
    `${sourceLines(20_000).join('\n')}\n`,
  );
}

const floodScript = `import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const markers = process.argv[2];
process.stdout.write('Press a key to flood the terminal\\r\\n');
writeFileSync(join(markers, ${JSON.stringify(floodReady)}), '');
process.stdin.setRawMode?.(true);
process.stdin.resume();
process.stdin.once('data', () => {
  let index = 0;
  const write = () => {
    while (index < 100000) {
      const line = '\\x1b[2m' + String(index).padStart(6) + '\\x1b[0m \\x1b[32mINFO\\x1b[0m \\x1b[36m[worker-' + (index % 8) + ']\\x1b[0m processed request ' + ((index * 7919) % 100000) + ' in ' + (index % 97) + ' ms \\x1b[33mpath=/api/items/' + index + '\\x1b[0m\\r\\n';
      index++;
      if (!process.stdout.write(line)) {
        process.stdout.once('drain', write);
        return;
      }
    }
    process.stdout.write('Flood done\\r\\n', () =>
      writeFileSync(join(markers, ${JSON.stringify(floodDone)}), ''),
    );
  };
  write();
});
`;

export function perfData(
  folder = path.join(os.tmpdir(), `fastforward-perf-data-${version}`),
): PerfData {
  const data = {
    repository: path.join(folder, 'repository'),
    files: path.join(folder, 'files'),
    flood: path.join(folder, 'flood.mjs'),
  };
  const ready = path.join(folder, 'ready');
  if (!fs.existsSync(ready)) {
    fs.rmSync(folder, { recursive: true, force: true });
    makeRepository(data.repository);
    makeFiles(data.files);
    fs.writeFileSync(ready, '');
  }
  fs.writeFileSync(data.flood, floodScript);
  unreadForADay(data.files);
  return data;
}

const day = 24 * 60 * 60 * 1000;

function unreadForADay(folder: string): void {
  const read = new Date(Date.now() - day);
  const written = new Date(Date.UTC(2026, 0, 1));
  for (const entry of fs.readdirSync(folder, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (entry.isFile()) {
      fs.utimesSync(path.join(entry.parentPath, entry.name), read, written);
    }
  }
}
