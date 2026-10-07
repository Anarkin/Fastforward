import * as fs from 'node:fs';
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
