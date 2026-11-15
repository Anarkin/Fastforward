import { tabStop } from './tabStops';
import { graphemes } from './graphemes';
import type { TextWidths } from './textWidths';

export function columnsOf(
  text: string,
  widths: TextWidths | undefined,
): (index: number) => number {
  const special = widths ? /[^ -~]/g : /\t/g;
  let clusters: Intl.Segments | undefined;
  const clusterAt = (index: number) => {
    if (!widths || text[index] === '\t') {
      return undefined;
    }
    clusters ??= graphemes.segment(text);
    const cluster = clusters.containing(index);
    return (
      cluster && {
        start: cluster.index,
        end: cluster.index + cluster.segment.length,
        columns: widths.of(cluster.segment) / widths.char,
      }
    );
  };
  const specialFrom = (index: number) => {
    special.lastIndex = index;
    return special.exec(text)?.index ?? Infinity;
  };
  let at = 0;
  let column = 0;
  let next = specialFrom(0);
  return (index) => {
    while (next < index) {
      column += next - at;
      at = next;
      const cluster = clusterAt(at);
      if (!cluster) {
        column = tabStop(column);
        at += 1;
      } else if (cluster.end > index) {
        return column;
      } else {
        column += cluster.columns - (at - cluster.start);
        at = cluster.end;
      }
      next = specialFrom(at);
    }
    column += index - at;
    at = index;
    return column;
  };
}
