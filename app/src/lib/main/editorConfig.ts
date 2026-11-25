import type { FileTabSize } from '../shared/tabSize';
import * as path from 'node:path';
type LineEnding = 'lf' | 'crlf' | 'cr';

const isLineEnding = (value: unknown): value is LineEnding =>
  value === 'lf' || value === 'crlf' || value === 'cr';

const charsets = [
  'latin1',
  'utf-8',
  'utf-8-bom',
  'utf-16be',
  'utf-16le',
] as const;

export type EditorCharset = (typeof charsets)[number];

export interface EditorConfig {
  readonly endOfLine?: LineEnding;
  readonly charset?: EditorCharset;
  readonly indentStyle?: 'space' | 'tab';
  readonly indentSize?: number;
  readonly tabWidth?: number;
  readonly insertFinalNewline?: boolean;
  readonly trimTrailingWhitespace?: boolean;
  readonly files: readonly string[];
  readonly setIn: {
    readonly endOfLine?: string;
    readonly charset?: string;
    readonly indentStyle?: string;
    readonly indentSize?: string;
    readonly tabWidth?: string;
  };
}

interface Section {
  readonly glob: string;
  readonly properties: ReadonlyMap<string, string>;
}

interface Parsed {
  readonly root: boolean;
  readonly sections: readonly Section[];
}

const commentStart = /^[;#]/;

function parsed(content: string): Parsed {
  let root = false;
  const sections: Section[] = [];
  let properties: Map<string, string> | undefined;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || commentStart.test(line)) {
      continue;
    }
    if (line.startsWith('[') && line.endsWith(']')) {
      properties = new Map();
      sections.push({ glob: line.slice(1, -1), properties });
      continue;
    }
    const equals = line.indexOf('=');
    if (equals === -1) {
      continue;
    }
    const key = line.slice(0, equals).trim().toLowerCase();
    const value = line
      .slice(equals + 1)
      .trim()
      .toLowerCase();
    if (properties === undefined) {
      root = key === 'root' && value === 'true' ? true : root;
    } else {
      properties.set(key, value);
    }
  }
  return { root, sections };
}

const special = /[.+^$()|\\]/;

function numbers(from: number, to: number): string {
  const [low, high] = from <= to ? [from, to] : [to, from];
  return high - low > 10_000
    ? '\\d+'
    : Array.from({ length: high - low + 1 }, (_, at) => String(low + at)).join(
        '|',
      );
}

function globBody(glob: string): string {
  let body = '';
  let braces = 0;
  for (let at = 0; at < glob.length; at++) {
    const character = glob[at];
    if (character === '\\' && at + 1 < glob.length) {
      at += 1;
      body += special.test(glob[at]) ? `\\${glob[at]}` : glob[at];
    } else if (character === '*') {
      if (glob[at + 1] === '*') {
        body += '.*';
        at += 1;
      } else {
        body += '[^/]*';
      }
    } else if (character === '?') {
      body += '[^/]';
    } else if (character === '[') {
      const end = glob.indexOf(']', at + 1);
      if (end === -1) {
        body += '\\[';
      } else {
        const inside = glob.slice(at + 1, end);
        body += inside.startsWith('!')
          ? `[^${inside.slice(1)}]`
          : `[${inside}]`;
        at = end;
      }
    } else if (character === '{') {
      const end = glob.indexOf('}', at + 1);
      const range =
        end === -1
          ? null
          : /^(-?\d+)\.\.(-?\d+)$/.exec(glob.slice(at + 1, end));
      if (range !== null && end !== -1) {
        body += `(?:${numbers(Number(range[1]), Number(range[2]))})`;
        at = end;
      } else {
        body += '(?:';
        braces += 1;
      }
    } else if (character === ',' && braces > 0) {
      body += '|';
    } else if (character === '}' && braces > 0) {
      body += ')';
      braces -= 1;
    } else {
      body += special.test(character) ? `\\${character}` : character;
    }
  }
  return body + ')'.repeat(braces);
}

export function globPattern(glob: string): RegExp {
  const anchored = glob.startsWith('/');
  const pattern = anchored ? glob.slice(1) : glob;
  const anywhere = !pattern.includes('/');
  try {
    return new RegExp(`^${anywhere ? '(?:.*/)?' : ''}${globBody(pattern)}$`);
  } catch {
    return /$^/;
  }
}

const positive = (value: string | undefined) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
};

const boolean = (value: string | undefined) =>
  value === 'true' ? true : value === 'false' ? false : undefined;

const isCharset = (value: unknown): value is EditorCharset =>
  charsets.some((charset) => charset === value);

interface Property {
  readonly value: string;
  readonly file: string;
}

function typed(
  properties: ReadonlyMap<string, Property>,
  files: readonly string[],
): EditorConfig {
  const valueOf = (key: string) => properties.get(key)?.value;
  const endOfLine = valueOf('end_of_line');
  const charset = valueOf('charset');
  const indentStyle = valueOf('indent_style');
  const indentSize = positive(valueOf('indent_size'));
  const tabWidth = positive(valueOf('tab_width'));
  const insertFinalNewline = boolean(valueOf('insert_final_newline'));
  const trimTrailingWhitespace = boolean(valueOf('trim_trailing_whitespace'));
  const endOfLineIn = properties.get('end_of_line')?.file;
  const charsetIn = properties.get('charset')?.file;
  const fileOf = (key: string, value: unknown) => {
    const file = properties.get(key)?.file;
    return value === undefined || file === undefined ? undefined : file;
  };
  const indentStyleIn = fileOf(
    'indent_style',
    indentStyle === 'space' || indentStyle === 'tab' ? indentStyle : undefined,
  );
  const indentSizeIn = fileOf('indent_size', indentSize);
  const tabWidthIn = fileOf('tab_width', tabWidth);
  return {
    ...(isLineEnding(endOfLine) && { endOfLine }),
    ...(isCharset(charset) && { charset }),
    ...((indentStyle === 'space' || indentStyle === 'tab') && { indentStyle }),
    ...(indentSize !== undefined && { indentSize }),
    ...(tabWidth !== undefined && { tabWidth }),
    ...(insertFinalNewline !== undefined && { insertFinalNewline }),
    ...(trimTrailingWhitespace !== undefined && { trimTrailingWhitespace }),
    files,
    setIn: {
      ...(isLineEnding(endOfLine) &&
        endOfLineIn !== undefined && { endOfLine: endOfLineIn }),
      ...(isCharset(charset) &&
        charsetIn !== undefined && { charset: charsetIn }),
      ...(indentStyleIn !== undefined && { indentStyle: indentStyleIn }),
      ...(indentSizeIn !== undefined && { indentSize: indentSizeIn }),
      ...(tabWidthIn !== undefined && { tabWidth: tabWidthIn }),
    },
  };
}

const fileName = '.editorconfig';

export async function editorConfigOf(
  file: string,
  read: (config: string) => Promise<string | undefined>,
): Promise<EditorConfig> {
  const found: {
    readonly folder: string;
    readonly file: string;
    readonly config: Parsed;
  }[] = [];
  const files: string[] = [];
  for (let folder = path.dirname(file); ;) {
    const configFile = path.join(folder, fileName);
    const content = await read(configFile);
    if (content !== undefined) {
      const config = parsed(content);
      found.push({ folder, file: configFile, config });
      files.push(configFile);
      if (config.root) {
        break;
      }
    }
    const parent = path.dirname(folder);
    if (parent === folder) {
      break;
    }
    folder = parent;
  }
  const properties = new Map<string, Property>();
  for (const { folder, file: configFile, config } of found.toReversed()) {
    const relative = path.relative(folder, file).split(path.sep).join('/');
    for (const { glob, properties: set } of config.sections) {
      if (globPattern(glob).test(relative)) {
        for (const [key, value] of set) {
          if (value === 'unset') {
            properties.delete(key);
          } else {
            properties.set(key, { value, file: configFile });
          }
        }
      }
    }
  }
  return typed(properties, files);
}

export function fileTabSizeOf(config: EditorConfig): FileTabSize | undefined {
  if (config.tabWidth !== undefined) {
    return {
      size: config.tabWidth,
      key: 'tab_width',
      ...(config.setIn.tabWidth !== undefined && {
        file: config.setIn.tabWidth,
      }),
    };
  }
  return config.indentSize === undefined
    ? undefined
    : {
        size: config.indentSize,
        key: 'indent_size',
        ...(config.setIn.indentSize !== undefined && {
          file: config.setIn.indentSize,
        }),
      };
}
