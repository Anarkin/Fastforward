import { bundledLanguagesInfo } from 'shiki/langs';

const extensionLanguages: Record<string, string> = {
  h: 'c',
  hpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  htm: 'html',
  csproj: 'xml',
  fsproj: 'xml',
  vbproj: 'xml',
  slnx: 'xml',
  props: 'xml',
  targets: 'xml',
  nuspec: 'xml',
  xaml: 'xml',
  axaml: 'xml',
  resx: 'xml',
  svg: 'xml',
  csx: 'csharp',
  cshtml: 'razor',
  fsx: 'fsharp',
  fsi: 'fsharp',
  editorconfig: 'ini',
  ex: 'elixir',
  exs: 'elixir',
  pl: 'perl',
  pm: 'perl',
  ml: 'ocaml',
  mli: 'ocaml',
};

const nameLanguages: Record<string, string> = {
  'app.config': 'xml',
  'nuget.config': 'xml',
  'packages.config': 'xml',
  'web.config': 'xml',
  'cargo.lock': 'toml',
};

export const languageIds = new Map(
  bundledLanguagesInfo.flatMap((info) =>
    [info.id, ...(info.aliases ?? [])].map((name) => [name, info.id] as const),
  ),
);

export function languageOf(path: string): string | undefined {
  const name = path
    .slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
    .toLowerCase();
  const extension = name.slice(name.lastIndexOf('.') + 1);
  return (
    languageIds.get(
      nameLanguages[name] ?? extensionLanguages[extension] ?? extension,
    ) ?? languageIds.get(name)
  );
}

export const languages = bundledLanguagesInfo
  .map(({ id, name, aliases = [] }) => ({
    id,
    name,
    keywords: [id, ...aliases].join(' '),
  }))
  .toSorted((a, b) => a.name.localeCompare(b.name));
