import type { FitAddon } from '@xterm/addon-fit';
import type { UnicodeGraphemesAddon } from '@xterm/addon-unicode-graphemes';
import type { WebglAddon } from '@xterm/addon-webgl';
import type { IDecoration, IMarker, Terminal } from '@xterm/xterm';
import { terminalKey } from './keys';
import { snapOffset, watchDevicePixels } from '../../../lib/page/devicePixels';
import { dialogHoldsFocus } from '../../../lib/page/modalDialog';
import { rowGlide } from '../../../lib/page/rowScroll';
import type { ScrollSettings } from '../../../lib/page/scrollSettings';
import { notchesOf, type Wheel } from '../../../lib/page/wheelTurns';
import { pressedAlone, type Modifiers } from '../../../lib/shared/keymap';
import { hexOf, withHiddenCursor, terminalTheme } from './theme';
import { firstFrom, screenMatches, type ScreenMatch } from './screenFind';
import { maxMatches } from '../../../lib/shared/textMatches';
import type { SearchOptions } from '../../../lib/shared/searchOptions';
import type { MatchesFound } from '../../../lib/shared/textMatches';
import { cellOf, cellsOf } from './cells';
import { layoutGrid } from './grid';
import { type TerminalToWebview } from '../shared/protocol';
import { inputChunks } from './inputChunks';
import { sizeWithin } from '../shared/size';
import type { Renderer } from '../shared/settings';
import type { WindowsPty } from '../shared/protocol';
import type { FromScreen } from './store';
import type { CursorLook } from '../../../lib/shared/cursorSettings';
import { cursorOptions, drawnByPage, PageCursor } from './pageCursor';
import { PlaceReports } from './placeReports';
import {
  proxyElements,
  scrollProxy,
  type ScrollProxy,
} from '../../../lib/page/scrollProxies';
import { inNextFrame } from '../../../lib/page/afterPaint';
import { setWheeled } from '../../../lib/page/scrollbarLinks';
import { lineAt, scrolledBack } from './scrolledBack';
import { stepped, type Heading } from './lineSteps';

const resizeDelay = 50;

export interface Xterm {
  readonly Terminal: typeof Terminal;
  readonly FitAddon: typeof FitAddon;
  readonly WebglAddon: typeof WebglAddon;
  readonly UnicodeGraphemesAddon: typeof UnicodeGraphemesAddon;
}

export function loadXterm(): Promise<Xterm> {
  return Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
    import('@xterm/addon-webgl'),
    import('@xterm/addon-unicode-graphemes'),
  ]).then(([xterm, fit, webgl, unicode]) => ({
    Terminal: xterm.Terminal,
    FitAddon: fit.FitAddon,
    WebglAddon: webgl.WebglAddon,
    UnicodeGraphemesAddon: unicode.UnicodeGraphemesAddon,
  }));
}

export function screenMargin(left: number, top: number, ratio: number): string {
  return `${snapOffset(top, ratio)}px 0 0 ${snapOffset(left, ratio)}px`;
}

export interface WheelScreen {
  readonly buffer: 'normal' | 'alternate';
  readonly mouse: string;
}

export function wheelLines(
  wheel: Wheel & Modifiers,
  { buffer, mouse }: WheelScreen,
  perNotch: number,
): number | undefined {
  const notches = notchesOf(wheel);
  return notches !== undefined &&
    pressedAlone(wheel) &&
    buffer === 'normal' &&
    mouse === 'none'
    ? notches * perNotch
    : undefined;
}

const glideOf = (smooth: boolean) => (smooth ? rowGlide : 0);

export interface TerminalViewOptions {
  readonly tab: string;
  readonly renderer: Renderer;
  readonly scrollback: number;
  readonly minimumContrastRatio: number;
  readonly windowsPty: WindowsPty | undefined;
  readonly post: (message: FromScreen) => void;
  readonly onCopy: (text: string) => void;
  readonly scrolling: () => ScrollSettings;
  readonly cursor: CursorLook;
  readonly onFind: (selected: string) => void;
  readonly onFound: (found: MatchesFound) => void;
}

const highlightLimit = 1000;

export class TerminalView {
  private readonly terminal: Terminal;
  private readonly fit: FitAddon;
  private finding:
    { readonly query: string; readonly options: SearchOptions } | undefined;
  private matches: readonly ScreenMatch[] = [];
  private currentMatch = 0;
  private highlights: (IMarker | IDecoration)[] = [];
  private refinding = 0;
  private readonly cursor: PageCursor;
  private readonly place: PlaceReports;
  private readonly probe = document.createElement('span');
  private readonly bar: ScrollProxy;
  private readonly barFrame: HTMLElement;
  private readonly observer = new ResizeObserver(() => this.layOut());
  private readonly scheme = matchMedia('(prefers-color-scheme: dark)');
  private readonly stopWatching: () => void;
  private margin = '';
  private resizing: ReturnType<typeof setTimeout> | undefined;
  private size: string;
  private exited = false;
  private webgl = false;
  private heading: Heading | undefined;

  constructor(
    private readonly xterm: Xterm,
    private readonly element: HTMLElement,
    private readonly options: TerminalViewOptions,
  ) {
    this.probe.hidden = true;
    element.append(this.probe);
    this.fit = new xterm.FitAddon();
    this.terminal = new xterm.Terminal({
      allowProposedApi: true,
      scrollback: options.scrollback,
      minimumContrastRatio: options.minimumContrastRatio,
      smoothScrollDuration: glideOf(options.scrolling().smooth),
      ...cursorOptions(options.cursor),
      ...cellsOf(this.probe, this.webgl),
      theme: this.theme(),
      linkHandler: { activate: () => undefined },
      ...(options.windowsPty && { windowsPty: options.windowsPty }),
    });
    this.terminal.loadAddon(this.fit);
    this.terminal.loadAddon(new xterm.UnicodeGraphemesAddon());
    this.terminal.onWriteParsed(this.findAgain);
    this.terminal.attachCustomKeyEventHandler((event) => this.key(event));
    this.terminal.onData((data) => this.typed(data));
    this.terminal.onResize(() => this.resized());
    this.terminal.open(element);
    this.cursor = new PageCursor(this.terminal, options.cursor, this.restyle);
    this.place = new PlaceReports(this.terminal, {
      scrolled: (top) =>
        options.post({ type: 'scrolled', tab: options.tab, top }),
      selected: (selection) =>
        options.post({ type: 'selected', tab: options.tab, selection }),
    });
    element.addEventListener('wheel', this.wheel, {
      capture: true,
      passive: false,
    });
    const { frame, element: bar } = proxyElements('vertical');
    this.barFrame = frame;
    element.after(frame);
    this.bar = scrollProxy(
      bar,
      'vertical',
      {
        onDrag: (share) => {
          this.heading = undefined;
          this.terminal.scrollToLine(
            lineAt(this.terminal.buffer.active, share),
          );
        },
        onLetGo: () => undefined,
        onStep: this.step,
      },
      () => element,
    );
    setWheeled(element, 'rows', this.wheel);
    this.terminal.onScroll(this.showBar);
    this.terminal.onWriteParsed(this.showBar);
    this.terminal.onResize(this.showBar);
    this.terminal.buffer.onBufferChange(this.showBar);
    this.showBar();
    if (options.renderer === 'webgl') {
      this.useWebgl();
    }
    this.terminal.options = cellsOf(this.probe, this.webgl);
    this.layOut();
    this.size = this.sizeKey();
    this.observer.observe(element);
    this.scheme.addEventListener('change', this.followScheme);
    this.stopWatching = watchDevicePixels(this.followRatio);
    addEventListener('resize', this.snapToPixels);
    options.post({
      type: 'open',
      tab: options.tab,
      columns: this.terminal.cols,
      rows: this.terminal.rows,
    });
    if (!dialogHoldsFocus(element.ownerDocument)) {
      this.terminal.focus();
    }
  }

  private readonly barShown = inNextFrame(() =>
    this.bar.show(
      scrolledBack(this.terminal.buffer.active, this.terminal.rows),
    ),
  );

  private readonly showBar = () => this.barShown.ask();

  private readonly step = (lines: number) => {
    const { viewportY, baseY } = this.terminal.buffer.active;
    const { by, heading } = stepped(
      this.heading,
      { shown: viewportY, last: baseY },
      lines,
      performance.now(),
      this.terminal.options.smoothScrollDuration ?? 0,
    );
    this.heading = heading;
    this.terminal.scrollLines(by);
  };

  private readonly wheel = (event: WheelEvent) => {
    const lines = wheelLines(
      event,
      {
        buffer: this.terminal.buffer.active.type,
        mouse: this.terminal.modes.mouseTrackingMode,
      },
      this.options.scrolling().wheelRows,
    );
    if (lines !== undefined) {
      event.preventDefault();
      this.step(lines);
    }
  };

  glide(smooth: boolean): void {
    this.terminal.options.smoothScrollDuration = glideOf(smooth);
  }

  receive(message: TerminalToWebview): void {
    const { tab, post } = this.options;
    switch (message.type) {
      case 'screen':
        if (message.tab === tab) {
          this.place.writing();
          this.terminal.reset();
          this.cursor.reset();
          this.terminal.write(message.data, () =>
            this.place.restore(message.top, message.selection),
          );
          this.exited = message.exited;
        }
        return;
      case 'output':
        if (message.tab === tab) {
          const chars = message.data.length;
          this.terminal.write(message.data, () =>
            post({ type: 'ack', tab, chars }),
          );
        }
        return;
      case 'exited':
        if (message.tab === tab) {
          this.exited = true;
        }
        return;
      default:
        return;
    }
  }

  dispose(): void {
    clearTimeout(this.resizing);
    cancelAnimationFrame(this.refinding);
    this.observer.disconnect();
    this.scheme.removeEventListener('change', this.followScheme);
    this.element.removeEventListener('wheel', this.wheel, { capture: true });
    this.stopWatching();
    removeEventListener('resize', this.snapToPixels);
    this.place.dispose();
    this.cursor.dispose();
    this.barShown.cancel();
    this.terminal.dispose();
    this.bar.stop();
    setWheeled(this.element, 'rows', undefined);
    this.barFrame.remove();
    this.probe.remove();
  }

  private useWebgl(): void {
    try {
      const webgl = new this.xterm.WebglAddon();
      webgl.onContextLoss(() => {
        webgl.dispose();
        this.webgl = false;
        this.terminal.options = cellsOf(this.probe, this.webgl);
        this.layOut();
      });
      this.terminal.loadAddon(webgl);
      this.webgl = true;
    } catch {
      this.webgl = false;
    }
  }

  private key(event: KeyboardEvent): boolean {
    if (event.type !== 'keydown') {
      return true;
    }
    const key = terminalKey(event, this.terminal.hasSelection());
    if (key === 'find') {
      event.preventDefault();
      this.options.onFind(this.terminal.getSelection());
    }
    if (key === 'copy') {
      event.preventDefault();
      if (this.terminal.hasSelection()) {
        this.options.onCopy(this.terminal.getSelection());
        this.terminal.clearSelection();
      }
    }
    return key === 'shell';
  }

  private typed(data: string): void {
    const { tab, post } = this.options;
    if (this.exited) {
      if (data.includes('\r')) {
        this.exited = false;
        post({ type: 'restart', tab });
      }
      return;
    }
    for (const chunk of inputChunks(data)) {
      post({ type: 'input', tab, data: chunk });
    }
  }

  private resized(): void {
    clearTimeout(this.resizing);
    this.resizing = setTimeout(() => {
      const size = this.sizeKey();
      if (size === this.size) {
        return;
      }
      this.size = size;
      this.options.post({
        type: 'resize',
        tab: this.options.tab,
        columns: this.terminal.cols,
        rows: this.terminal.rows,
      });
    }, resizeDelay);
  }

  private sizeKey(): string {
    return `${this.terminal.cols}x${this.terminal.rows}`;
  }

  private readonly followScheme = () => {
    this.terminal.options.theme = this.theme();
  };

  private readonly followRatio = () => {
    this.terminal.options = cellsOf(this.probe, this.webgl);
    this.layOut();
  };

  private layOut(): void {
    this.snapToPixels();
    const { cols, rows } = this.terminal;
    const drawn = this.element.querySelector('.xterm-screen');
    const proposed = this.fit.proposeDimensions();
    const grid = layoutGrid(
      this.element.getBoundingClientRect(),
      drawn?.getBoundingClientRect() ?? { width: 0, height: 0 },
      { columns: cols, rows },
      proposed === undefined
        ? undefined
        : { columns: proposed.cols, rows: proposed.rows },
      this.webgl ? devicePixelRatio : undefined,
      this.webgl ? cellOf(this.probe) : undefined,
    );
    const within = sizeWithin(grid.columns, grid.rows);
    if (
      within !== undefined &&
      (within.columns !== cols || within.rows !== rows)
    ) {
      this.terminal.resize(within.columns, within.rows);
    }
    this.cursor.draw();
  }

  private readonly snapToPixels = () => {
    const panel = this.element.parentElement;
    if (!panel) {
      return;
    }
    const box = panel.getBoundingClientRect();
    const inset = getComputedStyle(this.element);
    const margin = screenMargin(
      box.left + panel.clientLeft + parseFloat(inset.left),
      box.top + panel.clientTop + parseFloat(inset.top),
      devicePixelRatio,
    );
    if (margin !== this.margin) {
      this.margin = margin;
      this.element.style.margin = margin;
    }
  };

  private readonly restyle = () => {
    this.terminal.options.theme = this.theme();
  };

  find(query: string, options: SearchOptions, step: 0 | 1 | -1): void {
    if (query === '') {
      this.stopFinding();
      return;
    }
    const same =
      this.finding?.query === query &&
      JSON.stringify(this.finding.options) === JSON.stringify(options);
    this.finding = { query, options };
    if (!same || step === 0) {
      const buffer = this.terminal.buffer.active;
      this.matches = screenMatches(buffer, query, options);
      this.currentMatch = firstFrom(this.matches, buffer.viewportY, 0);
    } else if (this.matches.length > 0) {
      this.currentMatch =
        (this.currentMatch + step + this.matches.length) % this.matches.length;
    }
    this.highlight();
    this.reveal();
  }

  stopFinding(): void {
    this.finding = undefined;
    this.matches = [];
    this.currentMatch = 0;
    this.highlight();
  }

  focus(): void {
    this.terminal.focus();
  }

  private readonly findAgain = () => {
    if (this.finding === undefined || this.refinding !== 0) {
      return;
    }
    this.refinding = requestAnimationFrame(() => {
      this.refinding = 0;
      const { finding } = this;
      if (finding === undefined) {
        return;
      }
      const shown = this.matches[this.currentMatch]?.[0];
      const buffer = this.terminal.buffer.active;
      this.matches = screenMatches(buffer, finding.query, finding.options);
      this.currentMatch = firstFrom(
        this.matches,
        shown?.row ?? buffer.viewportY,
        shown?.column ?? 0,
      );
      this.highlight();
    });
  };

  private reveal(): void {
    const row = this.matches[this.currentMatch]?.[0]?.row;
    const buffer = this.terminal.buffer.active;
    if (
      row !== undefined &&
      (row < buffer.viewportY || row >= buffer.viewportY + this.terminal.rows)
    ) {
      this.terminal.scrollToLine(
        Math.max(0, row - Math.floor(this.terminal.rows / 3)),
      );
    }
  }

  private highlight(): void {
    for (const highlight of this.highlights) {
      highlight.dispose();
    }
    this.highlights = [];
    const count = this.matches.length;
    this.options.onFound({
      current: this.currentMatch,
      matches: count,
      capped: count >= maxMatches,
    });
    const colors = this.matchColors();
    if (count === 0 || colors === undefined) {
      return;
    }
    const buffer = this.terminal.buffer.active;
    const cursorLine = buffer.baseY + buffer.cursorY;
    const from = Math.max(0, this.currentMatch - highlightLimit / 2);
    this.matches.slice(from, from + highlightLimit).forEach((match, at) => {
      const current = from + at === this.currentMatch;
      for (const piece of match) {
        const marker = this.terminal.registerMarker(piece.row - cursorLine);
        if (marker === undefined) {
          continue;
        }
        this.highlights.push(marker);
        const decoration = this.terminal.registerDecoration({
          marker,
          x: piece.column,
          width: piece.width,
          backgroundColor: current ? colors.current : colors.background,
          foregroundColor: colors.foreground,
          layer: 'top',
        });
        if (decoration !== undefined) {
          this.highlights.push(decoration);
        }
      }
    });
  }

  private matchColors():
    | {
        readonly background: string;
        readonly current: string;
        readonly foreground: string;
      }
    | undefined {
    const resolved = (color: string) => {
      this.probe.style.color = color;
      return hexOf(getComputedStyle(this.probe).color);
    };
    const background = resolved('var(--color-search-match)');
    const current = resolved('var(--color-search-match-current)');
    const foreground = resolved('var(--color-search-match-foreground)');
    return background === undefined ||
      current === undefined ||
      foreground === undefined
      ? undefined
      : { background, current, foreground };
  }

  private theme() {
    const theme = terminalTheme((color) => {
      this.probe.style.color = color;
      return getComputedStyle(this.probe).color;
    });
    return drawnByPage(this.cursor?.style ?? this.options.cursor.style)
      ? withHiddenCursor(theme)
      : theme;
  }
}
