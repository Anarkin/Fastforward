import type { LineRanges } from '../../../components/syntax/page/engine';
import { CodeCells, type CodeLook } from './codeCells';
import { gpuDevice, gpuGeneration, watchGpu } from './gpuDevice';

export class CodeBlocks {
  private readonly cells = new Map<Element, CodeCells>();
  private readonly scroller: Element | null;
  private readonly resized: ResizeObserver;
  private readonly unwatched: () => void;
  private look: CodeLook | undefined;
  private generation = gpuGeneration();
  private frame = 0;

  constructor(private readonly pane: HTMLElement) {
    this.scroller = pane.closest('.viewer-body');
    this.scroller?.addEventListener('scroll', this.later, {
      capture: true,
      passive: true,
    });
    this.resized = new ResizeObserver(this.later);
    if (this.scroller !== null) {
      this.resized.observe(this.scroller);
    }
    this.resized.observe(pane);
    this.unwatched = watchGpu(this.later);
    pane.ownerDocument.addEventListener('selectionchange', this.selected);
  }

  private readonly later = () => {
    if (this.frame === 0) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.update();
      });
    }
  };

  private readonly selected = () => {
    const selection = this.pane.ownerDocument.getSelection();
    if (
      selection !== null &&
      !selection.isCollapsed &&
      this.pane.contains(selection.anchorNode)
    ) {
      for (const cells of this.cells.values()) {
        cells.clearSelection();
      }
    }
  };

  private readonly began = (selecting: CodeCells) => {
    this.pane.ownerDocument.getSelection()?.removeAllRanges();
    for (const cells of this.cells.values()) {
      if (cells !== selecting) {
        cells.clearSelection();
      }
    }
  };

  private update(anew = false): void {
    const device = gpuDevice();
    const generation = gpuGeneration();
    const renewed = anew || generation !== this.generation;
    this.generation = generation;
    const within = this.scroller?.getBoundingClientRect();
    for (const cells of this.cells.values()) {
      cells.shown(device, generation, within, renewed);
    }
  }

  relooked(look: CodeLook | undefined): void {
    this.look = look;
    if (look !== undefined) {
      for (const cells of this.cells.values()) {
        cells.looked(look);
      }
      this.later();
    }
  }

  add(code: HTMLElement, text: string): void {
    if (this.look === undefined || this.cells.has(code)) {
      return;
    }
    this.cells.set(
      code,
      new CodeCells(code, text, this.look, {
        began: this.began,
        scroller: () => this.scroller,
      }),
    );
    this.later();
  }

  colored(code: Element, lines: LineRanges): void {
    this.cells.get(code)?.colored(lines);
  }

  removeIn(block: Element): void {
    for (const [code, cells] of this.cells) {
      if (block.contains(code)) {
        cells.dispose();
        this.cells.delete(code);
      }
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.scroller?.removeEventListener('scroll', this.later, {
      capture: true,
    });
    this.resized.disconnect();
    this.unwatched();
    this.pane.ownerDocument.removeEventListener(
      'selectionchange',
      this.selected,
    );
    for (const cells of this.cells.values()) {
      cells.dispose();
    }
    this.cells.clear();
  }
}
