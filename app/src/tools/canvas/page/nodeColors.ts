import { colorCode } from '../../../components/syntax/page/colorer';
import type { LineRanges } from '../../../components/syntax/page/engine';

const mostKept = 500;

const lineBreak = '\n';

interface Colored {
  readonly language: string;
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
  private readonly colored = new Map<string, Map<string, LineRanges>>();
  private readonly asked = new Map<string, Set<string>>();
  private readonly last = new Map<string, Colored>();
  private kept = 0;

  constructor(
    private readonly arrived: () => void,
    private readonly color: (
      language: string,
      text: string,
    ) => Promise<LineRanges | undefined> = colorCode,
  ) {}

  of(id: string, text: string, language: string): LineRanges | undefined {
    const found = this.colored.get(language)?.get(text);
    if (found !== undefined) {
      this.last.set(id, { language, text, lines: found });
      return found;
    }
    this.ask(language, text);
    const before = this.last.get(id);
    return before?.language === language ? keptLines(before, text) : undefined;
  }

  private ask(language: string, text: string): void {
    const asking = this.asked.get(language) ?? new Set<string>();
    if (asking.has(text)) {
      return;
    }
    this.asked.set(language, asking.add(text));
    void this.color(language, text).then((lines) => {
      asking.delete(text);
      if (lines === undefined) {
        return;
      }
      if (this.kept >= mostKept) {
        this.colored.clear();
        this.kept = 0;
      }
      const known = this.colored.get(language) ?? new Map<string, LineRanges>();
      this.colored.set(language, known.set(text, lines));
      this.kept += 1;
      this.arrived();
    });
  }
}
