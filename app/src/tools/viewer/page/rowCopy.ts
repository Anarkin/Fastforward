export interface RowText {
  readonly text: string;
  readonly from: number;
}

function charsBefore(row: Element, container: Node, offset: number): number {
  const before = document.createRange();
  before.selectNodeContents(row);
  before.setEnd(container, offset);
  return before.toString().length;
}

export function copiedRows(
  selection: Selection | null,
  shown: Element | null,
  rowText: ((row: Element) => RowText | undefined) | undefined,
): string | undefined {
  if (selection === null || selection.rangeCount === 0 || shown === null) {
    return undefined;
  }
  const range = selection.getRangeAt(0);
  const rows = [...shown.children].filter((row) => range.intersectsNode(row));
  if (
    rows.length < 2 ||
    (rowText === undefined &&
      !rows.slice(0, -1).some((row) => row.hasAttribute('data-continues')))
  ) {
    return undefined;
  }
  return rows
    .map((row, index) => {
      const start = row.contains(range.startContainer)
        ? charsBefore(row, range.startContainer, range.startOffset)
        : undefined;
      const end = row.contains(range.endContainer)
        ? charsBefore(row, range.endContainer, range.endOffset)
        : undefined;
      const whole = rowText?.(row);
      const text =
        whole === undefined
          ? (row.textContent ?? '').slice(start ?? 0, end)
          : whole.text.slice(
              start === undefined ? 0 : whole.from + start,
              end === undefined ? undefined : whole.from + end,
            );
      const ends =
        index === rows.length - 1 || row.hasAttribute('data-continues')
          ? ''
          : '\n';
      return `${text}${ends}`;
    })
    .join('');
}
