import type { IDisposable, Terminal } from '@xterm/xterm';
import {
  blinkAnimation,
  cursorBlinkInterval,
  drawnCursor,
  paintCursor,
  type Box,
} from '../../../lib/page/cursor';
import type {
  CursorLook,
  CursorStyle,
} from '../../../lib/shared/cursorSettings';

const cursorMode = 25;

const alternateScreens = [47, 1047, 1049];

const setsMode = (
  params: readonly (number | readonly number[])[],
  modes: readonly number[],
): boolean =>
  params.some((param) =>
    (typeof param === 'number' ? [param] : param).some((mode) =>
      modes.includes(mode),
    ),
  );

export const setsCursorMode = (
  params: readonly (number | readonly number[])[],
): boolean => setsMode(params, [cursorMode]);

interface CursorBuffer {
  readonly cursorX: number;
  readonly cursorY: number;
  readonly baseY: number;
  readonly viewportY: number;
  getLine(
    y: number,
  ): { getCell(x: number): { getWidth(): number } | undefined } | undefined;
}

export interface CursorCell {
  readonly column: number;
  readonly row: number;
  readonly cells: number;
}

export function cursorCellOf(
  buffer: CursorBuffer,
  columns: number,
  rows: number,
): CursorCell | undefined {
  const line = buffer.baseY + buffer.cursorY;
  const row = line - buffer.viewportY;
  if (row < 0 || row >= rows) {
    return undefined;
  }
  const column = Math.min(buffer.cursorX, columns - 1);
  const width = buffer.getLine(line)?.getCell(column)?.getWidth();
  return { column, row, cells: width === 2 ? 2 : 1 };
}

export function cellBox(
  screen: Box,
  columns: number,
  rows: number,
  { column, row, cells }: CursorCell,
): Box {
  const width = screen.width / columns;
  const height = screen.height / rows;
  return {
    left: screen.left + column * width,
    top: screen.top + row * height,
    width: width * cells,
    height,
  };
}

export function gridOf(
  rect: Box,
  canvas: { readonly width: number; readonly height: number } | undefined,
  ratio: number,
): Box {
  return canvas === undefined
    ? rect
    : {
        left: rect.left,
        top: rect.top,
        width: canvas.width / ratio,
        height: canvas.height / ratio,
      };
}

export type CursorTerminal = Pick<
  Terminal,
  | 'parser'
  | 'onRender'
  | 'onCursorMove'
  | 'onScroll'
  | 'textarea'
  | 'element'
  | 'buffer'
  | 'rows'
  | 'cols'
  | 'options'
  | 'refresh'
>;

export const drawnByPage = (style: string): style is 'underline' | 'outline' =>
  style === 'underline' || style === 'outline';

export type ProgramCursor =
  | 'reset'
  | { readonly style: CursorStyle | undefined; readonly blink: boolean };

const programStyles: readonly (CursorStyle | undefined)[] = [
  undefined,
  'block',
  'block',
  'underline',
  'underline',
  'bar',
  'bar',
];

export function programCursor(
  params: readonly (number | readonly number[])[],
): ProgramCursor {
  const [first = 0] = params;
  const param = typeof first === 'number' ? first : (first[0] ?? 0);
  return param === 0
    ? 'reset'
    : { style: programStyles[param], blink: param % 2 === 1 };
}

export class PageCursor {
  private readonly element = document.createElement('div');
  private shown = true;
  private initialized = false;
  private programStyle: CursorStyle | undefined;
  private programBlink: boolean | undefined;
  private place = '';
  private blinker: ReturnType<typeof setInterval> | undefined;
  private blinkedOff = false;
  private readonly disposables: IDisposable[];

  constructor(
    private readonly terminal: CursorTerminal,
    private readonly look: CursorLook,
    private readonly onStyle: () => void,
  ) {
    this.element.className = 'terminal-cursor';
    this.element.setAttribute('aria-hidden', 'true');
    const { parser } = terminal;
    const resetting = () => {
      this.shown = true;
      this.restyle('reset');
      return false;
    };
    this.initialized = document.activeElement === terminal.textarea;
    this.disposables = [
      parser.registerCsiHandler({ prefix: '?', final: 'h' }, (params) => {
        if (setsCursorMode(params)) {
          this.shown = true;
        }
        if (setsMode(params, alternateScreens)) {
          this.initialized = true;
        }
        return false;
      }),
      parser.registerCsiHandler({ prefix: '?', final: 'l' }, (params) => {
        if (setsCursorMode(params)) {
          this.shown = false;
        }
        return false;
      }),
      parser.registerCsiHandler(
        { intermediates: ' ', final: 'q' },
        (params) => {
          this.restyle(programCursor(params));
          return false;
        },
      ),
      parser.registerCsiHandler({ intermediates: '!', final: 'p' }, resetting),
      parser.registerEscHandler({ final: 'c' }, resetting),
      terminal.onRender(this.draw),
      terminal.onCursorMove(this.draw),
      terminal.onScroll(this.draw),
    ];
    terminal.textarea?.addEventListener('focus', this.focused);
    terminal.textarea?.addEventListener('blur', this.draw);
  }

  private readonly focused = () => {
    this.initialized = true;
    this.draw();
  };

  get style(): CursorStyle {
    return this.programStyle ?? this.look.style;
  }

  private get blink(): boolean {
    return this.programBlink ?? this.terminal.options.cursorBlink ?? false;
  }

  private restyle(program: ProgramCursor): void {
    const before = this.style;
    if (program === 'reset') {
      this.programStyle = undefined;
      this.programBlink = undefined;
    } else {
      this.programStyle = program.style ?? this.programStyle;
      this.programBlink = program.blink;
    }
    if (this.style !== before) {
      this.onStyle();
    }
    this.draw();
  }

  private blinkWithoutFocus(): void {
    const { terminal } = this;
    const focused =
      document.activeElement === terminal.textarea && document.hasFocus();
    const blinks =
      !focused &&
      this.blink &&
      this.shown &&
      this.initialized &&
      !drawnByPage(this.style);
    if (blinks && this.blinker === undefined) {
      this.blinker = setInterval(() => {
        this.blinkedOff = !this.blinkedOff;
        this.showInactive();
      }, cursorBlinkInterval);
    } else if (!blinks && this.blinker !== undefined) {
      clearInterval(this.blinker);
      this.blinker = undefined;
      this.blinkedOff = false;
    }
    this.showInactive();
  }

  private showInactive(): void {
    const style =
      drawnByPage(this.style) || this.blinkedOff ? 'none' : this.style;
    const { terminal } = this;
    if (terminal.options.cursorInactiveStyle !== style) {
      terminal.options.cursorInactiveStyle = style;
      const cell = cursorCellOf(
        terminal.buffer.active,
        terminal.cols,
        terminal.rows,
      );
      if (cell !== undefined) {
        terminal.refresh(cell.row, cell.row);
      }
    }
  }

  reset(): void {
    this.shown = true;
    this.restyle('reset');
  }

  readonly draw = (): void => {
    const { terminal } = this;
    this.blinkWithoutFocus();
    const screen = terminal.element?.querySelector('.xterm-screen') ?? null;
    const cell = cursorCellOf(
      terminal.buffer.active,
      terminal.cols,
      terminal.rows,
    );
    if (
      screen === null ||
      cell === undefined ||
      !this.shown ||
      !this.initialized ||
      !drawnByPage(this.style)
    ) {
      this.element.remove();
      this.place = '';
      return;
    }
    const ratio = devicePixelRatio;
    const rect = screen.getBoundingClientRect();
    const canvas = screen.querySelector('canvas:not(.xterm-link-layer)');
    const grid = gridOf(
      canvas?.getBoundingClientRect() ?? rect,
      canvas instanceof HTMLCanvasElement ? canvas : undefined,
      ratio,
    );
    paintCursor(
      this.element,
      drawnCursor({
        cell: cellBox(grid, terminal.cols, terminal.rows, cell),
        text: '',
        shape: this.style,
        thickness: this.look.width,
        ratio,
        origin: { left: rect.left, top: rect.top },
      }),
    );
    const place = JSON.stringify([cell, this.blink]);
    if (place !== this.place) {
      this.element.style.animation = this.blink
        ? blinkAnimation(this.element.style.animationName === 'cursor-blink')
        : 'none';
      this.place = place;
    }
    if (this.element.parentElement !== screen) {
      screen.append(this.element);
    }
  };

  dispose(): void {
    clearInterval(this.blinker);
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.terminal.textarea?.removeEventListener('focus', this.focused);
    this.terminal.textarea?.removeEventListener('blur', this.draw);
    this.element.remove();
  }
}
