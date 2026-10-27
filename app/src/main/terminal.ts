import * as tty from 'node:tty';
import * as originalFs from 'original-fs';
import type { BrowserWindow, NativeImage } from 'electron';
import { PageInputs, type Pointing } from '../terminal/events';
import {
  interrupts,
  TerminalReader,
  type TerminalInput,
} from '../terminal/input';
import {
  clearScreen,
  enterScreen,
  FrameWriter,
  leaveScreen,
  pageSizeOf,
  SizeProbe,
  sizeQueries,
  stretched,
  stretchedRegion,
  stretchOf,
  type Frame,
  type TerminalSize,
} from '../terminal/screen';
import { strings } from '../shared/strings';

const windowsConsoleInput = '\\\\.\\CONIN$';
const answerTime = 2000;
const settleTime = 100;
const frameRate = 30;

export type TerminalOpening =
  | {
      readonly kind: 'opened';
      readonly terminal: Terminal;
      readonly size: TerminalSize;
    }
  | { readonly kind: 'failed'; readonly problem: string };

export async function openTerminal(
  output: tty.WriteStream = process.stdout,
): Promise<TerminalOpening> {
  const input = consoleInput();
  if (!output.isTTY || input === undefined) {
    return { kind: 'failed', problem: strings.terminal.notTerminal };
  }
  const terminal = new Terminal(input, output);
  const size = await terminal.measure();
  if (size === undefined || !size.sixel) {
    terminal.close();
    return {
      kind: 'failed',
      problem:
        size === undefined
          ? strings.terminal.noPixels
          : strings.terminal.noSixel,
    };
  }
  return { kind: 'opened', terminal, size };
}

export class Terminal {
  private measured: TerminalSize | undefined;
  private probe:
    { readonly probe: SizeProbe; readonly done: () => void } | undefined;
  private onInput: (input: TerminalInput) => void = () => {};
  private shown = false;

  constructor(
    private readonly input: tty.ReadStream,
    private readonly output: tty.WriteStream,
  ) {
    const reader = new TerminalReader();
    input.setRawMode(true);
    input.setEncoding('utf8');
    input.on('data', (chunk: string) => {
      for (const each of reader.read(chunk)) {
        this.route(each);
      }
    });
  }

  measure(): Promise<TerminalSize | undefined> {
    const { promise, resolve } = Promise.withResolvers<void>();
    const probe = new SizeProbe();
    this.probe = { probe, done: resolve };
    this.output.write(sizeQueries);
    const timer = setTimeout(resolve, answerTime);
    return promise.then(() => {
      clearTimeout(timer);
      this.probe = undefined;
      this.measured = probe.size({
        width: this.output.columns,
        height: this.output.rows,
      });
      return this.measured;
    });
  }

  show(window: BrowserWindow, stretch: number, quit: () => void): void {
    const size = this.measured;
    if (size === undefined) {
      return;
    }
    this.shown = true;
    let pointing = pointingOf(size, stretch);
    this.output.write(enterScreen(size.pixelMouse));
    const frames = new FrameWriter(
      (text, done) => this.output.write(text, () => done()),
      size.cell,
    );
    const contents = window.webContents;
    contents.setFrameRate(frameRate);
    contents.on('paint', (_event, dirty, image) =>
      frames.paint(stretchedRegion(dirty, stretch), () =>
        stretchedFrameOf(image, stretch),
      ),
    );
    const inputs = new PageInputs(() => performance.now());
    this.onInput = (input) => {
      if (interrupts(input)) {
        quit();
        return;
      }
      for (const event of inputs.of(input, pointing)) {
        contents.sendInputEvent(event);
      }
    };
    let resizing: NodeJS.Timeout | undefined;
    this.output.on('resize', () => {
      clearTimeout(resizing);
      resizing = setTimeout(
        () =>
          void this.measure().then((measured) => {
            if (measured === undefined || window.isDestroyed()) {
              return;
            }
            pointing = pointingOf(measured, stretch);
            const page = pageSizeOf(measured, stretch);
            window.setContentSize(page.width, page.height);
            this.output.write(clearScreen);
            frames.redraw(measured.cell);
          }),
        settleTime,
      );
    });
    this.input.on('end', quit);
    this.input.on('error', quit);
    process.once('SIGHUP', quit);
    contents.focus();
    contents.invalidate();
  }

  close(): void {
    if (this.shown) {
      this.output.write(leaveScreen);
      this.shown = false;
    }
    this.input.setRawMode(false);
    this.input.destroy();
  }

  private route(input: TerminalInput): void {
    if (this.probe !== undefined) {
      if (this.probe.probe.take(input)) {
        this.probe.done();
      }
      if (input.kind === 'size' || input.kind === 'mode') {
        return;
      }
    }
    if (input.kind !== 'attributes') {
      this.onInput(input);
    }
  }
}

function consoleInput(): tty.ReadStream | undefined {
  if (process.stdin.isTTY) {
    return process.stdin;
  }
  if (process.platform !== 'win32') {
    return undefined;
  }
  try {
    const descriptor = originalFs.openSync(windowsConsoleInput, 'r+');
    return tty.isatty(descriptor) ? new tty.ReadStream(descriptor) : undefined;
  } catch {
    return undefined;
  }
}

export function stretchIn(
  size: TerminalSize,
  windowsTerminalCellAspect: number,
): number {
  return stretchOf(
    size.cell,
    process.env.WT_SESSION === undefined
      ? undefined
      : windowsTerminalCellAspect,
  );
}

function pointingOf(size: TerminalSize, stretch: number): Pointing {
  return { cell: size.cell, pixels: size.pixelMouse, stretch };
}

function stretchedFrameOf(image: NativeImage, stretch: number): Frame {
  const { width, height } = image.getSize();
  return stretched(
    { pixels: image.toBitmap(), width, height },
    Math.round(width * stretch),
  );
}
