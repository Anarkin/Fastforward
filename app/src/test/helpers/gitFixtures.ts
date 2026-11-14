import * as assert from 'node:assert';
import * as fs from 'node:fs';
import { createServer } from 'node:http';
import * as path from 'node:path';
import {
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';

export interface RenamingRepository {
  temp: TempRepository;
  rename: string;
  blob: string;
}

export async function renamingRepository(
  name: string,
): Promise<RenamingRepository> {
  const temp = await tempRepository(tempFolder(name));
  await temp.commit('first', { 'first.txt': 'one\n' });
  await temp.commit('second', { 'second.txt': 'two\n' });
  await temp.git('mv', 'second.txt', 'renamed.txt');
  await temp.git('commit', '-m', 'rename');
  const [rename, blob] = await temp.resolve('HEAD', 'HEAD:first.txt');
  return { temp, rename, blob };
}

export interface SubmoduleRepository {
  repository: TempRepository;
  sub: TempRepository;
  inner: string;
}

export async function submoduleRepository(
  name: string,
  files: Record<string, string> = {},
): Promise<SubmoduleRepository> {
  const repository = await tempRepository(tempFolder(name));
  const sub = await tempRepository(path.join(repository.root, 'sub'));
  await sub.commit('inner');
  const [inner] = await sub.resolve('HEAD');
  for (const [file, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(repository.root, file), content);
  }
  await repository.git('add', '.');
  await repository.git('commit', '-m', 'initial');
  return { repository, sub, inner };
}

export async function deleteTags(repository: TempRepository): Promise<void> {
  const tags = (await repository.git('tag'))
    .split('\n')
    .filter((tag) => tag !== '');
  if (tags.length > 0) {
    await repository.git('tag', '-d', ...tags);
  }
}

export async function lockedRepository(root: string): Promise<{
  repository: TempRepository;
  asked: () => string[];
  close: () => Promise<void>;
}> {
  const repository = await tempRepository(root);
  await repository.commit('a');
  const asked = `${root}-asked.txt`.replaceAll('\\', '/');
  await repository.git('config', 'credential.helper', '');
  await repository.git(
    'config',
    '--add',
    'credential.helper',
    `!f() { test "$1" = get || exit 0; echo "[$GCM_INTERACTIVE]" >> '${asked}'; echo username=u; echo password=p; }; f`,
  );
  const server = createServer((_request, response) => {
    response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="locked"' });
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(typeof address === 'object' && address !== null);
  await repository.git(
    'remote',
    'add',
    'origin',
    `http://127.0.0.1:${address.port}/x`,
  );
  return {
    repository,
    asked: () => fs.readFileSync(asked, 'utf8').trim().split('\n'),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export function fortyLines(changed: number): string {
  const lines = Array.from({ length: 40 }, (_, i) =>
    i === changed ? 'changed' : `line ${i + 1}`,
  );
  return `${lines.join('\n')}\n`;
}

export interface ViewRepositories {
  folder: string;
  repository: TempRepository;
  fixture: { a: string; b: string; f2: string; merge: string };
  other: string;
  otherHead: string;
}

export async function viewRepositories(): Promise<ViewRepositories> {
  const folder = tempFolder('view');
  const repository = await tempRepository(path.join(folder, 'main'));
  await repository.commit('a');
  await repository.git('checkout', '-b', 'feature');
  await repository.commit('f1');
  await repository.commit('f2');
  await repository.git('checkout', 'main');
  await repository.commit('b');
  await repository.git('merge', '--no-ff', 'feature', '-m', 'merge feature');
  const [a, b, f2, merge] = await repository.resolve(
    'main~2',
    'main~1',
    'feature',
    'main',
  );
  await repository.git('commit-graph', 'write', '--reachable');

  const second = await tempRepository(path.join(folder, 'other'));
  await second.commit('other');
  const [otherHead] = await second.resolve('HEAD');
  return {
    folder,
    repository,
    fixture: { a, b, f2, merge },
    other: second.root,
    otherHead,
  };
}

export async function restoreRepository(
  repository: TempRepository,
  merge: string,
): Promise<void> {
  await repository.git('checkout', '-f', 'main');
  await repository.git('reset', '--hard', merge);
}
