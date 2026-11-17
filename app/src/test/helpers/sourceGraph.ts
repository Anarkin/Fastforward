import * as fs from 'node:fs';
import * as path from 'node:path';

export const source = path.join(__dirname, '..', '..');
export const appFolder = path.join(source, '..');

export const testFiles = fs
  .readdirSync(path.join(__dirname, '..'), {
    recursive: true,
    encoding: 'utf8',
  })
  .map((file) => file.replaceAll('\\', '/'))
  .filter((file) => /\.tsx?$/.test(file));

export function mirrored(folder: string, under: string): boolean {
  return ['', '.ts', '.tsx'].some((extension) =>
    fs.existsSync(path.join(under, `${folder}${extension}`)),
  );
}

export const sourceFiles = fs
  .readdirSync(source, { recursive: true, encoding: 'utf8' })
  .map((file) => file.replaceAll('\\', '/'))
  .filter(
    (file) =>
      !file.startsWith('test/') && /\.(ts|tsx|css|html|json)$/.test(file),
  );

export function importsOf(file: string): string[] {
  const text = fs.readFileSync(path.join(source, file), 'utf8');
  return [
    ...text.matchAll(/from '(\.{1,2}\/[^']+)'/g),
    ...text.matchAll(/import\('(\.{1,2}\/[^']+?)(?:\.js)?'\)/g),
  ].map(([, spec = '']) =>
    path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)),
  );
}

export function read(file: string): string {
  return fs.readFileSync(path.join(source, file), 'utf8');
}

export function toolOf(file: string): string | undefined {
  return /^tools\/([^/]+)\//.exec(file)?.[1];
}

export function componentOf(file: string): string | undefined {
  return /^components\/([^/]+)\//.exec(file)?.[1];
}

export const components = fs.readdirSync(path.join(source, 'components'));

export const sourceAndHelperFiles = [
  ...sourceFiles,
  ...testFiles
    .filter((file) => !/\.test\.tsx?$/.test(file))
    .map((file) => `test/${file}`),
];

export function filesAmong(files: readonly string[], target: string): string[] {
  return [target, `${target}.ts`, `${target}.tsx`].filter((file) =>
    files.includes(file),
  );
}

export function sourceFilesOf(target: string): string[] {
  return filesAmong(sourceFiles, target);
}

export function reachedFrom(roots: readonly string[]): ReadonlySet<string> {
  const reached = new Set<string>();
  const visit = (file: string): void => {
    if (reached.has(file)) {
      return;
    }
    reached.add(file);
    for (const target of importsOf(file).flatMap(sourceFilesOf)) {
      visit(target);
    }
  };
  for (const root of roots) {
    visit(root);
  }
  return reached;
}

export function usesOf(file: string): string[] {
  const workers = [...read(file).matchAll(/new URL\('(\w+)\.js'/g)].flatMap(
    ([, name]) =>
      sourceFiles.filter(
        (worker) => path.posix.basename(worker).replace(/\.tsx?$/, '') === name,
      ),
  );
  return [...importsOf(file).flatMap(sourceFilesOf), ...workers];
}

export function partOf(file: string): string | undefined {
  return /^(?:boot|shell|tools\/[^/]+|components\/[^/]+)/.exec(file)?.[0];
}
