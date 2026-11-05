interface PathPart {
  readonly name: string;
  readonly path: string;
  readonly separator: string;
}

const rootPattern = /^(?:[a-zA-Z]:|[\\/]{2}[^\\/]+[\\/][^\\/]+|)[\\/]?/;
const namePattern = /([^\\/]+)([\\/]*)/g;

export function pathParts(path: string): PathPart[] {
  const [root = ''] = rootPattern.exec(path) ?? [];
  const parts: PathPart[] =
    root === '' ? [] : [{ name: root, path: root, separator: '' }];
  for (const found of path.slice(root.length).matchAll(namePattern)) {
    const [, name = '', separator = ''] = found;
    const end = root.length + found.index + name.length;
    parts.push({ name, path: path.slice(0, end), separator });
  }
  return parts;
}
