export interface PathPart {
  readonly name: string;
  readonly path: string;
  readonly separator: string;
}

const rootPattern = /^(?:[a-zA-Z]:|[\\/]{2}[^\\/]+[\\/][^\\/]+|)[\\/]?/;
const namePattern = /([^\\/]+)([\\/]*)/g;
const driveAlone = /^[a-zA-Z]:$/;

export function pathParts(path: string): PathPart[] {
  const [root = ''] = rootPattern.exec(path) ?? [];
  const rootPath = driveAlone.test(root) ? `${root}\\` : root;
  const parts: PathPart[] =
    root === '' ? [] : [{ name: root, path: rootPath, separator: '' }];
  for (const found of path.slice(root.length).matchAll(namePattern)) {
    const [, name = '', separator = ''] = found;
    const end = root.length + found.index + name.length;
    parts.push({ name, path: path.slice(0, end), separator });
  }
  return parts;
}
