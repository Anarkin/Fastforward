import type { LineRanges } from '../../../components/syntax/page/engine';
import type { FindMark } from '../../../components/cells/page/marks';
import { CodeCells, type CodeLook } from './codeCells';
import {
  gpuDevice,
  gpuGeneration,
  watchGpu,
} from '../../../components/cells/page/gpuDevice';

export class CodeBlocks {
  private readonly cells = new Map<Element, CodeCells>();
  private readonly texts = new Map<Element, string>();
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
    this.texts.set(code, text);
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

  textOf(code: Element): string | undefined {
    return this.cells.has(code) ? this.texts.get(code) : undefined;
  }

  found(
    finds: ReadonlyMap<Element, ReadonlyMap<number, readonly FindMark[]>>,
    searching: boolean,
  ): void {
    for (const [code, cells] of this.cells) {
      cells.found(searching ? (finds.get(code) ?? new Map()) : undefined);
    }
  }

  boxOf(
    code: Element,
    line: number,
    start: number,
    end: number,
  ): DOMRect | undefined {
    return this.cells.get(code)?.boxOf(line, start, end);
  }

  colored(code: Element, lines: LineRanges): void {
    this.cells.get(code)?.colored(lines);
  }

  removeIn(block: Element): void {
    for (const [code, cells] of this.cells) {
      if (block.contains(code)) {
        cells.dispose();
        this.cells.delete(code);
        this.texts.delete(code);
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
