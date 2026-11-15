import * as fs from 'node:fs';
import * as path from 'node:path';

export const limits = {
  maxColoredBytes: 10 * 1024 * 1024,
  wholeLineBytes: 64 * 1024,
  rowBytes: 4096,
  maxPreviewBytes: 1024 * 1024,
  maxImageSize: 192 * 1024 * 1024,
  maxMatches: 10_000,
};

export const syntaxLineLimit = 20_000;
export const appRoot = path.join(import.meta.dirname, '..', '..');

export interface FileColorGroup {
  readonly extensions: readonly string[] | string;
}

export const defaultColorGroups = (): readonly FileColorGroup[] => {
  const settings: {
    readonly tools: {
      readonly commander: { readonly fileColors: readonly FileColorGroup[] };
    };
  } = JSON.parse(
    fs.readFileSync(
      path.join(appRoot, 'src', 'shell', 'main', 'settings.json'),
      'utf8',
    ),
  );
  return settings.tools.commander.fileColors;
};

export const realSources = [
  'src/lib/shared/strings.ts',
  'src/tools/commander/page/listing.ts',
  'src/tools/commander/page/pane.tsx',
  'src/tools/commander/main/tool.ts',
  'src/shell/page/index.html',
  'esbuild.config.mts',
  'package.json',
].filter((source) => fs.existsSync(path.join(appRoot, source)));
