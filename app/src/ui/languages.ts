import { bundledLanguagesInfo } from 'shiki/langs';

const extensionLanguages: Record<string, string> = {
  h: 'c',
  hpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  htm: 'html',
  csproj: 'xml',
  props: 'xml',
  targets: 'xml',
  svg: 'xml',
};

export const languageIds = new Map(
  bundledLanguagesInfo.flatMap((info) =>
    [info.id, ...(info.aliases ?? [])].map((name) => [name, info.id] as const),
  ),
);

export function languageOf(path: string): string | undefined {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const extension = name.slice(name.lastIndexOf('.') + 1);
  return (
    languageIds.get(extensionLanguages[extension] ?? extension) ??
    languageIds.get(name)
  );
}

export const languages = bundledLanguagesInfo
  .map(({ id, name, aliases = [] }) => ({
    id,
    name,
    keywords: [id, ...aliases].join(' '),
  }))
  .toSorted((a, b) => a.name.localeCompare(b.name));
