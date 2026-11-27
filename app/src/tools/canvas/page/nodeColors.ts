import { colorCode } from '../../../components/syntax/page/colorer';
import type { LineRanges } from '../../../components/syntax/page/engine';

const mostKept = 500;

const lineBreak = '\n';

interface Colored {
  readonly text: string;
  readonly lines: LineRanges;
}

function keptLines(before: Colored, text: string): LineRanges {
  const old = before.text.split(lineBreak);
  return text
    .split(lineBreak)
    .map((line, at) => (old[at] === line ? (before.lines[at] ?? []) : []));
}

export class NodeColors {
  private readonly colored = new Map<string, LineRanges>();
  private readonly asked = new Set<string>();
  private readonly last = new Map<string, Colored>();

  constructor(
    private readonly arrived: () => void,
    private readonly color: (
      text: string,
    ) => Promise<LineRanges | undefined> = (text) =>
      colorCode('markdown', text),
  ) {}

  of(id: string, text: string): LineRanges | undefined {
    const found = this.colored.get(text);
    if (found !== undefined) {
      this.last.set(id, { text, lines: found });
      return found;
    }
    this.ask(text);
    const before = this.last.get(id);
    return before === undefined ? undefined : keptLines(before, text);
  }

  private ask(text: string): void {
    if (this.asked.has(text)) {
      return;
    }
    this.asked.add(text);
    void this.color(text).then((lines) => {
      this.asked.delete(text);
      if (lines === undefined) {
        return;
      }
      if (this.colored.size >= mostKept) {
        this.colored.clear();
      }
      this.colored.set(text, lines);
      this.arrived();
    });
  }
}
