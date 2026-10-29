import type { FitAddon } from '@xterm/addon-fit';
import type { Unicode11Addon } from '@xterm/addon-unicode11';
import type { WebglAddon } from '@xterm/addon-webgl';
import type { Terminal } from '@xterm/xterm';
import { terminalKey } from './keys';
import { snapOffset, watchDevicePixels } from '../../../ui/devicePixels';
import {
  fontVariables,
  letterSpacingFor,
  lineHeightFor,
  terminalFont,
  terminalTheme,
  type TerminalFont,
} from './theme';
import {
  inputChunks,
  type TerminalToHost,
  type TerminalToWebview,
} from '../shared/protocol';
import type { Renderer } from '../shared/settings';
import type { WindowsPty } from '../shared/protocol';

const resizeDelay = 50;

export interface Xterm {
  readonly Terminal: typeof Terminal;
  readonly FitAddon: typeof FitAddon;
  readonly WebglAddon: typeof WebglAddon;
  readonly Unicode11Addon: typeof Unicode11Addon;
}

export function loadXterm(): Promise<Xterm> {
  return Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
    import('@xterm/addon-webgl'),
    import('@xterm/addon-unicode11'),
  ]).then(([xterm, fit, webgl, unicode]) => ({
    Terminal: xterm.Terminal,
    FitAddon: fit.FitAddon,
    WebglAddon: webgl.WebglAddon,
    Unicode11Addon: unicode.Unicode11Addon,
  }));
}

export function screenMargin(left: number, top: number, ratio: number): string {
  return `${snapOffset(top, ratio)}px 0 0 ${snapOffset(left, ratio)}px`;
}

export interface TerminalViewOptions {
  readonly tab: string;
  readonly renderer: Renderer;
  readonly scrollback: number;
  readonly minimumContrastRatio: number;
  readonly windowsPty: WindowsPty | undefined;
  readonly post: (message: TerminalToHost) => void;
  readonly onCopy: (text: string) => void;
}

export class TerminalView {
  private readonly terminal: Terminal;
  private readonly fit: FitAddon;
  private readonly probe = document.createElement('span');
  private readonly observer = new ResizeObserver(() => this.layOut());
  private readonly scheme = matchMedia('(prefers-color-scheme: dark)');
  private readonly stopWatching: () => void;
  private margin = '';
  private resizing: ReturnType<typeof setTimeout> | undefined;
  private size: string;
  private exited = false;
  private webgl = false;

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
      ...this.cells(),
      theme: this.theme(),
      ...(options.windowsPty && { windowsPty: options.windowsPty }),
    });
    this.terminal.loadAddon(this.fit);
    this.terminal.loadAddon(new xterm.Unicode11Addon());
    this.terminal.unicode.activeVersion = '11';
    this.terminal.attachCustomKeyEventHandler((event) => this.key(event));
    this.terminal.onData((data) => this.typed(data));
    this.terminal.onResize(() => this.resized());
    this.terminal.open(element);
    if (options.renderer === 'webgl') {
      this.useWebgl();
    }
    this.terminal.options = this.cells();
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
    this.terminal.focus();
  }

  receive(message: TerminalToWebview): void {
    const { tab, post } = this.options;
    switch (message.type) {
      case 'screen':
        if (message.tab === tab) {
          this.terminal.reset();
          this.terminal.write(message.data);
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
    this.observer.disconnect();
    this.scheme.removeEventListener('change', this.followScheme);
    this.stopWatching();
    removeEventListener('resize', this.snapToPixels);
    this.terminal.dispose();
    this.probe.remove();
  }

  private useWebgl(): void {
    try {
      const webgl = new this.xterm.WebglAddon();
      webgl.onContextLoss(() => {
        webgl.dispose();
        this.webgl = false;
        this.terminal.options = this.cells();
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
    this.terminal.options = this.cells();
    this.layOut();
  };

  private layOut(): void {
    this.snapToPixels();
    this.fit.fit();
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

  private cells(): TerminalFont & {
    readonly lineHeight: number;
    readonly letterSpacing: number;
  } {
    const font = this.font();
    this.probe.style.lineHeight = fontVariables.rowHeight;
    this.probe.style.width = fontVariables.advance;
    const probed = getComputedStyle(this.probe);
    const rowHeight = Number.parseFloat(probed.lineHeight);
    const advance = Number.parseFloat(probed.width);
    const context = new OffscreenCanvas(1, 1).getContext('2d');
    if (context === null || !Number.isFinite(rowHeight)) {
      return {
        ...font,
        lineHeight: 1,
        letterSpacing: 0,
      };
    }
    context.font = `${font.fontSize}px ${font.fontFamily}`;
    const glyph = context.measureText('W');
    return {
      ...font,
      lineHeight: lineHeightFor(
        rowHeight,
        glyph.fontBoundingBoxAscent + glyph.fontBoundingBoxDescent,
        devicePixelRatio,
      ),
      letterSpacing:
        this.webgl && Number.isFinite(advance)
          ? letterSpacingFor(advance, glyph.width, devicePixelRatio)
          : 0,
    };
  }

  private theme() {
    return terminalTheme((color) => {
      this.probe.style.color = color;
      return getComputedStyle(this.probe).color;
    });
  }

  private font(): TerminalFont {
    this.probe.style.fontFamily = fontVariables.family;
    this.probe.style.fontSize = fontVariables.size;
    const style = getComputedStyle(this.probe);
    return terminalFont(style.fontFamily, style.fontSize);
  }
}
