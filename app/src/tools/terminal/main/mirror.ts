import { SerializeAddon } from '@xterm/addon-serialize';
import { UnicodeGraphemesAddon } from '@xterm/addon-unicode-graphemes';
import { Terminal } from '@xterm/headless';
import type { WindowsPty } from '../shared/protocol';
import {
  programCursor,
  programCursorSequence,
  setsCursorMode,
} from '../shared/programCursor';
import type { CursorStyle } from '../../../lib/shared/cursorSettings';
import { KeptPlace } from './screenPlace';

export interface Mirror {
  readonly terminal: Terminal;
  readonly place: KeptPlace;
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

const mouseEncodings = [1006, 1016];

function trackMouseEncoding(terminal: Terminal): () => string {
  let encoding: number | undefined;
  const modes = (set: boolean) => (params: (number | number[])[]) => {
    for (const mode of params) {
      if (typeof mode === 'number' && mouseEncodings.includes(mode)) {
        encoding = set ? mode : undefined;
      }
    }
    return false;
  };
  terminal.parser.registerCsiHandler({ prefix: '?', final: 'h' }, modes(true));
  terminal.parser.registerCsiHandler({ prefix: '?', final: 'l' }, modes(false));
  terminal.parser.registerEscHandler({ final: 'c' }, () => {
    encoding = undefined;
    return false;
  });
  return () => (encoding === undefined ? '' : `\x1b[?${encoding}h`);
}

function trackCursor(terminal: Terminal): () => string {
  let hidden = false;
  let style: CursorStyle | undefined;
  let blink: boolean | undefined;
  const { parser } = terminal;
  const reset = () => {
    hidden = false;
    style = undefined;
    blink = undefined;
    return false;
  };
  parser.registerCsiHandler({ prefix: '?', final: 'h' }, (params) => {
    hidden &&= !setsCursorMode(params);
    return false;
  });
  parser.registerCsiHandler({ prefix: '?', final: 'l' }, (params) => {
    hidden ||= setsCursorMode(params);
    return false;
  });
  parser.registerCsiHandler({ intermediates: ' ', final: 'q' }, (params) => {
    const asked = programCursor(params);
    if (asked === 'reset') {
      style = undefined;
      blink = undefined;
    } else {
      style = asked.style ?? style;
      blink = asked.blink;
    }
    return false;
  });
  parser.registerCsiHandler({ intermediates: '!', final: 'p' }, reset);
  parser.registerEscHandler({ final: 'c' }, reset);
  return () =>
    `${hidden ? '\x1b[?25l' : ''}${programCursorSequence(style, blink)}`;
}

type Region = readonly [top: number, bottom: number];

function trackScrollRegion(terminal: Terminal): () => string {
  const regions = new Map<'normal' | 'alternate', Region>();
  const { parser } = terminal;
  parser.registerCsiHandler({ final: 'r' }, (params) => {
    const [first, second] = params;
    const top = (typeof first === 'number' ? first : 0) || 1;
    const asked = typeof second === 'number' ? second : 0;
    const { rows } = terminal;
    const bottom =
      params.length < 2 || asked > rows || asked === 0 ? rows : asked;
    if (bottom > top) {
      const { type } = terminal.buffer.active;
      if (top === 1 && bottom === rows) {
        regions.delete(type);
      } else {
        regions.set(type, [top, bottom]);
      }
    }
    return false;
  });
  parser.registerCsiHandler({ intermediates: '!', final: 'p' }, () => {
    regions.delete(terminal.buffer.active.type);
    return false;
  });
  parser.registerEscHandler({ final: 'c' }, () => {
    regions.clear();
    return false;
  });
  terminal.onResize(() => regions.clear());
  terminal.buffer.onBufferChange(({ type }) => {
    if (type === 'normal') {
      regions.delete('alternate');
    }
  });
  return () => {
    const buffer = terminal.buffer.active;
    const region = regions.get(buffer.type);
    if (region === undefined) {
      return '';
    }
    const [top, bottom] = region;
    const row = buffer.cursorY + 1 - (terminal.modes.originMode ? top - 1 : 0);
    const column = Math.min(buffer.cursorX, terminal.cols - 1) + 1;
    return `\x1b[${top};${bottom}r\x1b[${row};${column}H`;
  };
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
  terminal.loadAddon(new UnicodeGraphemesAddon());
  const colors = trackColors(terminal);
  const mouseEncoding = trackMouseEncoding(terminal);
  const cursor = trackCursor(terminal);
  const region = trackScrollRegion(terminal);
  return {
    terminal,
    place: new KeptPlace(terminal),
    serialize: () =>
      colors() + serializer.serialize() + mouseEncoding() + cursor() + region(),
    scrollback: (lines) => {
      terminal.options.scrollback = lines;
    },
    dispose: () => terminal.dispose(),
  };
}
