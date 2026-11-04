import { SerializeAddon } from '@xterm/addon-serialize';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { Terminal } from '@xterm/headless';
import type { WindowsPty } from '../shared/protocol';

export interface Mirror {
  readonly terminal: Terminal;
  serialize(): string;
  scrollback(lines: number): void;
  dispose(): void;
}

const palette = 4;
const paletteReset = 104;
const dynamicColors = [10, 11, 12];
const dynamicColorReset = 100;
const query = '?';
const index = /^\d+$/;

function osc(ident: number, data: string): string {
  return `\x1b]${ident};${data}\x1b\\`;
}

function trackColors(terminal: Terminal): () => string {
  const paletteColors = new Map<number, string>();
  const defaultColors = new Map<number, string>();
  terminal.parser.registerOscHandler(palette, (data) => {
    const parts = data.split(';');
    for (let part = 0; part + 1 < parts.length; part += 2) {
      const color = parts[part + 1];
      if (index.test(parts[part]) && color !== query) {
        paletteColors.set(Number(parts[part]), color);
      }
    }
    return false;
  });
  terminal.parser.registerOscHandler(paletteReset, (data) => {
    if (data === '') {
      paletteColors.clear();
    }
    for (const part of data.split(';')) {
      if (index.test(part)) {
        paletteColors.delete(Number(part));
      }
    }
    return false;
  });
  for (const [offset, first] of dynamicColors.entries()) {
    terminal.parser.registerOscHandler(first, (data) => {
      for (const [next, color] of data.split(';').entries()) {
        const ident = dynamicColors[offset + next];
        if (ident !== undefined && color !== query) {
          defaultColors.set(ident, color);
        }
      }
      return false;
    });
    terminal.parser.registerOscHandler(first + dynamicColorReset, () => {
      defaultColors.delete(first);
      return false;
    });
  }
  return () =>
    [
      ...[...paletteColors].map(([key, color]) =>
        osc(palette, `${key};${color}`),
      ),
      ...dynamicColors.flatMap((ident) => {
        const color = defaultColors.get(ident);
        return color === undefined ? [] : [osc(ident, color)];
      }),
    ].join('');
}

export function createMirror({
  columns,
  rows,
  scrollback,
  windowsPty,
}: {
  readonly columns: number;
  readonly rows: number;
  readonly scrollback: number;
  readonly windowsPty?: WindowsPty;
}): Mirror {
  const terminal = new Terminal({
    cols: columns,
    rows,
    scrollback,
    allowProposedApi: true,
    ...(windowsPty && { windowsPty }),
  });
  const serializer = new SerializeAddon();
  terminal.loadAddon(serializer);
  terminal.loadAddon(new Unicode11Addon());
  terminal.unicode.activeVersion = '11';
  const colors = trackColors(terminal);
  return {
    terminal,
    serialize: () => colors() + serializer.serialize(),
    scrollback: (lines) => {
      terminal.options.scrollback = lines;
    },
    dispose: () => terminal.dispose(),
  };
}
