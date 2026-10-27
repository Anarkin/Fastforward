export type Modifier = 'shift' | 'alt' | 'control' | 'meta';
export type MouseButton = 'left' | 'middle' | 'right';

export type TerminalInput =
  | {
      readonly kind: 'key';
      readonly key: string;
      readonly modifiers: readonly Modifier[];
    }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'paste'; readonly text: string }
  | {
      readonly kind: 'mouse';
      readonly action: 'press' | 'release' | 'move';
      readonly button: MouseButton | undefined;
      readonly x: number;
      readonly y: number;
      readonly modifiers: readonly Modifier[];
    }
  | {
      readonly kind: 'wheel';
      readonly direction: 'up' | 'down' | 'left' | 'right';
      readonly x: number;
      readonly y: number;
      readonly modifiers: readonly Modifier[];
    }
  | {
      readonly kind: 'size';
      readonly of: 'window' | 'cell' | 'characters';
      readonly height: number;
      readonly width: number;
    }
  | { readonly kind: 'attributes'; readonly values: readonly number[] }
  | { readonly kind: 'mode'; readonly mode: number; readonly state: number };

const escape = '\x1b';
const pasteStart = '200~';
const pasteEnd = '\x1b[201~';

const lettered: Readonly<Record<string, string>> = {
  A: 'Up',
  B: 'Down',
  C: 'Right',
  D: 'Left',
  H: 'Home',
  F: 'End',
  P: 'F1',
  Q: 'F2',
  R: 'F3',
  S: 'F4',
};

const numbered: Readonly<Record<number, string>> = {
  1: 'Home',
  2: 'Insert',
  3: 'Delete',
  4: 'End',
  5: 'PageUp',
  6: 'PageDown',
  7: 'Home',
  8: 'End',
  11: 'F1',
  12: 'F2',
  13: 'F3',
  14: 'F4',
  15: 'F5',
  17: 'F6',
  18: 'F7',
  19: 'F8',
  20: 'F9',
  21: 'F10',
  23: 'F11',
  24: 'F12',
};

const sizes: Readonly<Record<number, 'window' | 'cell' | 'characters'>> = {
  4: 'window',
  6: 'cell',
  8: 'characters',
};

const buttons: readonly (MouseButton | undefined)[] = [
  'left',
  'middle',
  'right',
  undefined,
];
const directions = ['up', 'down', 'left', 'right'] as const;

export class TerminalReader {
  private pending = '';
  private pasted: string | undefined;

  read(chunk: string): TerminalInput[] {
    let text = this.pending + chunk;
    this.pending = '';
    const inputs: TerminalInput[] = [];
    let at = 0;
    while (at < text.length || this.pasted !== undefined) {
      if (this.pasted !== undefined) {
        this.pasted += text.slice(at);
        const end = this.pasted.indexOf(pasteEnd);
        if (end === -1) {
          return inputs;
        }
        inputs.push({ kind: 'paste', text: this.pasted.slice(0, end) });
        text = this.pasted.slice(end + pasteEnd.length);
        at = 0;
        this.pasted = undefined;
        continue;
      }
      const read = this.readOne(text, at);
      if (read === undefined) {
        this.pending = text.slice(at);
        return inputs;
      }
      if (read.input !== undefined) {
        inputs.push(read.input);
      }
      at = read.next;
    }
    return inputs;
  }

  private readOne(
    text: string,
    at: number,
  ): { input: TerminalInput | undefined; next: number } | undefined {
    const character = text[at];
    if (character !== escape) {
      return { input: plainInput(text, at), next: nextCharacter(text, at) };
    }
    if (at + 1 === text.length) {
      return { input: key('Escape'), next: at + 1 };
    }
    const after = text[at + 1];
    if (after === '[') {
      return this.readControlSequence(text, at + 2);
    }
    if (after === 'O') {
      if (at + 2 === text.length) {
        return undefined;
      }
      const name = lettered[text[at + 2]];
      return {
        input: name === undefined ? undefined : key(name),
        next: at + 3,
      };
    }
    if (after === escape) {
      return { input: key('Escape'), next: at + 1 };
    }
    const typed = String.fromCodePoint(text.codePointAt(at + 1) ?? 0);
    const lower = typed.toLowerCase();
    return {
      input: key(lower, lower === typed ? ['alt'] : ['shift', 'alt']),
      next: nextCharacter(text, at + 1),
    };
  }

  private readControlSequence(
    text: string,
    start: number,
  ): { input: TerminalInput | undefined; next: number } | undefined {
    let at = start;
    while (at < text.length && inRange(text, at, 0x30, 0x3f)) {
      at++;
    }
    const parametersEnd = at;
    while (at < text.length && inRange(text, at, 0x20, 0x2f)) {
      at++;
    }
    if (at === text.length) {
      return undefined;
    }
    const parameters = text.slice(start, parametersEnd);
    const intermediates = text.slice(parametersEnd, at);
    const final = text[at];
    if (parameters + final === pasteStart) {
      this.pasted = '';
    }
    return {
      input: controlSequenceInput(parameters, intermediates, final),
      next: at + 1,
    };
  }
}

function controlSequenceInput(
  parameters: string,
  intermediates: string,
  final: string,
): TerminalInput | undefined {
  const marker = /^[<=>?]/.test(parameters) ? parameters[0] : '';
  const numbers = parameters
    .slice(marker.length)
    .split(';')
    .map((parameter) => Number.parseInt(parameter, 10));
  if (marker === '<' && (final === 'M' || final === 'm')) {
    return mouseInput(numbers, final === 'M');
  }
  if (marker === '?' && final === 'c') {
    return { kind: 'attributes', values: numbers };
  }
  if (marker === '?' && intermediates === '$' && final === 'y') {
    return { kind: 'mode', mode: numbers[0], state: numbers[1] };
  }
  if (marker !== '' || intermediates !== '') {
    return undefined;
  }
  if (final === 't') {
    const of = sizes[numbers[0]];
    return of === undefined
      ? undefined
      : { kind: 'size', of, height: numbers[1], width: numbers[2] };
  }
  if (final === 'Z') {
    return key('Tab', ['shift']);
  }
  const name = final === '~' ? numbered[numbers[0]] : lettered[final];
  return name === undefined ? undefined : key(name, keyModifiers(numbers[1]));
}

function mouseInput(
  numbers: readonly number[],
  pressed: boolean,
): TerminalInput {
  const [code, x, y] = numbers;
  const modifiers = (
    [
      [4, 'shift'],
      [8, 'alt'],
      [16, 'control'],
    ] as const
  )
    .filter(([bit]) => (code & bit) !== 0)
    .map(([, modifier]) => modifier);
  if ((code & 64) !== 0) {
    return { kind: 'wheel', direction: directions[code & 3], x, y, modifiers };
  }
  return {
    kind: 'mouse',
    action: (code & 32) !== 0 ? 'move' : pressed ? 'press' : 'release',
    button: buttons[code & 3],
    x,
    y,
    modifiers,
  };
}

function keyModifiers(parameter: number | undefined): Modifier[] {
  const bits =
    parameter === undefined || Number.isNaN(parameter) ? 0 : parameter - 1;
  return (
    [
      [1, 'shift'],
      [2, 'alt'],
      [4, 'control'],
      [8, 'meta'],
    ] as const
  )
    .filter(([bit]) => (bits & bit) !== 0)
    .map(([, modifier]) => modifier);
}

function plainInput(text: string, at: number): TerminalInput | undefined {
  const code = text.charCodeAt(at);
  switch (code) {
    case 0x0d:
      return key('Enter');
    case 0x09:
      return key('Tab');
    case 0x7f:
      return key('Backspace');
    case 0x08:
      return key('Backspace', ['control']);
    case 0x00:
      return key('Space', ['control']);
  }
  if (code <= 0x1a) {
    return key(String.fromCharCode(0x60 + code), ['control']);
  }
  if (code < 0x20) {
    return undefined;
  }
  return {
    kind: 'text',
    text: String.fromCodePoint(text.codePointAt(at) ?? 0),
  };
}

function key(name: string, modifiers: readonly Modifier[] = []): TerminalInput {
  return { kind: 'key', key: name, modifiers };
}

function nextCharacter(text: string, at: number): number {
  return at + ((text.codePointAt(at) ?? 0) > 0xffff ? 2 : 1);
}

function inRange(text: string, at: number, low: number, high: number): boolean {
  const code = text.charCodeAt(at);
  return code >= low && code <= high;
}

export function interrupts(input: TerminalInput): boolean {
  return (
    input.kind === 'key' &&
    input.key === 'c' &&
    input.modifiers.length === 1 &&
    input.modifiers[0] === 'control'
  );
}
