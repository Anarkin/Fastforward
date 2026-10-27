import type {
  KeyboardInputEvent,
  MouseInputEvent,
  MouseWheelInputEvent,
} from 'electron';
import type { Modifier, MouseButton, TerminalInput } from './input';

export type PageInput =
  KeyboardInputEvent | MouseInputEvent | MouseWheelInputEvent;

export interface Pointing {
  readonly cell: { readonly width: number; readonly height: number };
  readonly pixels: boolean;
  readonly stretch: number;
}

type Point = { readonly x: number; readonly y: number };

const doubleClickTime = 500;
const doubleClickDistance = 4;
const wheelNotch = 100;
const lineBreak = /[\r\n]/;

export class PageInputs {
  private held: MouseButton | undefined;
  private lastPress:
    { button: MouseButton; at: Point; time: number; count: number } | undefined;

  constructor(private readonly now: () => number) {}

  of(input: TerminalInput, pointing: Pointing): PageInput[] {
    switch (input.kind) {
      case 'text':
        return typed(input.text);
      case 'key':
        return pressed(input.key, [...input.modifiers]);
      case 'paste':
        return Array.from(input.text)
          .filter((character) => !lineBreak.test(character))
          .map((character) => ({
            type: 'char',
            keyCode: character,
            modifiers: [],
          }));
      case 'mouse':
        return [this.mouse(input, pointOf(input, pointing))];
      case 'wheel':
        return [wheel(input, pointOf(input, pointing))];
      default:
        return [];
    }
  }

  private mouse(
    input: Extract<TerminalInput, { kind: 'mouse' }>,
    at: Point,
  ): MouseInputEvent {
    const modifiers = [...input.modifiers];
    if (input.action === 'move' || input.button === undefined) {
      const held = this.held;
      return held === undefined
        ? { type: 'mouseMove', ...at, modifiers }
        : {
            type: 'mouseMove',
            button: held,
            ...at,
            modifiers: [...modifiers, `${held}buttondown`],
          };
    }
    if (input.action === 'press') {
      this.held = input.button;
      const now = this.now();
      const last = this.lastPress;
      const count =
        last !== undefined &&
        last.button === input.button &&
        now - last.time <= doubleClickTime &&
        Math.abs(last.at.x - at.x) <= doubleClickDistance &&
        Math.abs(last.at.y - at.y) <= doubleClickDistance
          ? last.count + 1
          : 1;
      this.lastPress = { button: input.button, at, time: now, count };
      return {
        type: 'mouseDown',
        button: input.button,
        ...at,
        clickCount: count,
        modifiers,
      };
    }
    this.held = undefined;
    return {
      type: 'mouseUp',
      button: input.button,
      ...at,
      clickCount:
        this.lastPress?.button === input.button ? this.lastPress.count : 1,
      modifiers,
    };
  }
}

function typed(text: string): KeyboardInputEvent[] {
  const lower = text.toLowerCase();
  const modifiers: Modifier[] = lower === text ? [] : ['shift'];
  const keyCode = text === ' ' ? 'Space' : text;
  return [
    { type: 'keyDown', keyCode, modifiers },
    { type: 'char', keyCode: text, modifiers },
    { type: 'keyUp', keyCode, modifiers },
  ];
}

function pressed(keyCode: string, modifiers: Modifier[]): KeyboardInputEvent[] {
  return [
    { type: 'keyDown', keyCode, modifiers },
    { type: 'keyUp', keyCode, modifiers },
  ];
}

function wheel(
  input: Extract<TerminalInput, { kind: 'wheel' }>,
  at: Point,
): MouseWheelInputEvent {
  const vertical = input.direction === 'up' || input.direction === 'down';
  const ticks = input.direction === 'up' || input.direction === 'left' ? 1 : -1;
  return {
    type: 'mouseWheel',
    ...at,
    deltaX: vertical ? 0 : ticks * wheelNotch,
    deltaY: vertical ? ticks * wheelNotch : 0,
    wheelTicksX: vertical ? 0 : ticks,
    wheelTicksY: vertical ? ticks : 0,
    canScroll: true,
    modifiers: [...input.modifiers],
  };
}

function pointOf(position: Point, pointing: Pointing): Point {
  const { cell, stretch } = pointing;
  const [x, y] = pointing.pixels
    ? [Math.max(0, position.x - 1), Math.max(0, position.y - 1)]
    : [(position.x - 0.5) * cell.width, (position.y - 0.5) * cell.height];
  return { x: Math.floor(x / stretch), y: Math.floor(y) };
}
