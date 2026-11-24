const blockGap = '\n\n';

const lineBreak = '\n';

function textBetween(
  selection: Selection,
  whole: Range,
  setStart: (range: Range) => void,
  setEnd: (range: Range) => void,
): string {
  const range = whole.cloneRange();
  setStart(range);
  setEnd(range);
  selection.removeAllRanges();
  selection.addRange(range);
  return selection.toString().trim();
}

export function copiedMarkdown(
  selection: Selection,
  codes: Iterable<Element>,
  textOf: (code: Element) => string | undefined,
): string | undefined {
  if (selection.rangeCount === 0 || selection.isCollapsed) {
    return undefined;
  }
  const whole = selection.getRangeAt(0);
  const drawn = [...codes].flatMap((code) => {
    const text = textOf(code);
    const block = code.parentElement ?? code;
    return text !== undefined && whole.intersectsNode(block)
      ? [{ block, text }]
      : [];
  });
  const only = drawn.length === 1 ? drawn[0] : undefined;
  if (
    drawn.length === 0 ||
    (only !== undefined &&
      only.block.contains(whole.startContainer) &&
      only.block.contains(whole.endContainer))
  ) {
    return undefined;
  }
  const parts: string[] = [];
  let from: (range: Range) => void = (range) =>
    range.setStart(whole.startContainer, whole.startOffset);
  let startsInside = (block: Element) => block.contains(whole.startContainer);
  for (const { block, text } of drawn) {
    if (!startsInside(block)) {
      parts.push(
        textBetween(selection, whole, from, (range) =>
          range.setEndBefore(block),
        ),
      );
    }
    parts.push(text.endsWith(lineBreak) ? text.slice(0, -1) : text);
    from = (range) => range.setStartAfter(block);
    startsInside = () => false;
  }
  const last = drawn.at(-1)?.block;
  if (last !== undefined && !last.contains(whole.endContainer)) {
    parts.push(
      textBetween(selection, whole, from, (range) =>
        range.setEnd(whole.endContainer, whole.endOffset),
      ),
    );
  }
  selection.removeAllRanges();
  selection.addRange(whole);
  return parts.filter((part) => part !== '').join(blockGap);
}
