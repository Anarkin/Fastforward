import { matchesIn, maxMatches } from '../../../lib/shared/textMatches';
import type { SearchOptions } from '../../../lib/shared/searchOptions';
import type { FindMark } from '../../../components/cells/page/marks';
import { scratchRange } from '../../../shell/page/scratchRange';
import { codeRows } from './codeCells';

export type MarkdownMatch =
  | { readonly kind: 'prose'; readonly range: StaticRange }
  | {
      readonly kind: 'code';
      readonly code: Element;
      readonly line: number;
      readonly start: number;
      readonly end: number;
    };

const textBlocks =
  'p, li, h1, h2, h3, h4, h5, h6, td, th, dt, dd, caption, figcaption, summary, blockquote';

const isText = (node: Node): node is Text => node.nodeType === 3;

const isElement = (node: Node): node is Element => node.nodeType === 1;

interface Run {
  block: Element | null;
  readonly nodes: Text[];
}

function proseMatches(
  { nodes }: Run,
  query: string,
  options: SearchOptions,
  limit: number,
): MarkdownMatch[] {
  const starts: number[] = [];
  let text = '';
  for (const node of nodes) {
    starts.push(text.length);
    text += node.data;
  }
  const at = (offset: number, end: boolean): [Text, number] | undefined => {
    let index = nodes.length - 1;
    while (
      index > 0 &&
      (end ? (starts[index] ?? 0) >= offset : (starts[index] ?? 0) > offset)
    ) {
      index--;
    }
    const node = nodes[index];
    return node === undefined
      ? undefined
      : [node, offset - (starts[index] ?? 0)];
  };
  return matchesIn(text, query, options, limit).flatMap(({ start, end }) => {
    const from = at(start, false);
    const to = at(end, true);
    if (from === undefined || to === undefined) {
      return [];
    }
    const range = new (from[0].ownerDocument.defaultView ?? window).StaticRange(
      {
        startContainer: from[0],
        startOffset: from[1],
        endContainer: to[0],
        endOffset: to[1],
      },
    );
    return [{ kind: 'prose' as const, range }];
  });
}

export function markdownMatches(
  root: Element,
  codeOf: (element: Element) => string | undefined,
  query: string,
  options: SearchOptions,
  limit = maxMatches,
): MarkdownMatch[] {
  const found: MarkdownMatch[] = [];
  if (query === '') {
    return found;
  }
  let run: Run = { block: null, nodes: [] };
  const flush = () => {
    if (run.nodes.length > 0 && found.length < limit) {
      found.push(...proseMatches(run, query, options, limit - found.length));
    }
    run = { block: null, nodes: [] };
  };
  const walk = (parent: Node) => {
    for (const child of parent.childNodes) {
      if (found.length >= limit) {
        return;
      }
      if (isText(child)) {
        const block = child.parentElement?.closest(textBlocks) ?? null;
        if (block !== run.block) {
          flush();
          run.block = block;
        }
        run.nodes.push(child);
        continue;
      }
      if (!isElement(child) || child.hasAttribute('hidden')) {
        continue;
      }
      const code = codeOf(child);
      if (code === undefined) {
        walk(child);
        continue;
      }
      flush();
      for (const [line, row] of codeRows(code).entries()) {
        for (const { start, end } of matchesIn(
          row.row.text,
          query,
          options,
          limit - found.length,
        )) {
          found.push({ kind: 'code', code: child, line, start, end });
        }
      }
    }
  };
  walk(root);
  flush();
  return found;
}

interface CodeFinds {
  readonly found: (
    finds: ReadonlyMap<Element, ReadonlyMap<number, readonly FindMark[]>>,
    searching: boolean,
  ) => void;
  readonly boxOf: (
    code: Element,
    line: number,
    start: number,
    end: number,
  ) => DOMRect | undefined;
}

const matchName = 'markdown-match';

const currentName = 'markdown-match-current';

const highlights = (): HighlightRegistry | undefined =>
  typeof CSS !== 'undefined' && 'highlights' in CSS
    ? CSS.highlights
    : undefined;

export function showMarkdownMatches(
  matches: readonly MarkdownMatch[],
  current: number,
  blocks: CodeFinds | undefined,
  searching: boolean,
): void {
  const shown = matches[current];
  const registry = highlights();
  const prose = matches.flatMap((match) =>
    match.kind === 'prose' ? [match.range] : [],
  );
  if (registry !== undefined) {
    if (prose.length > 0) {
      registry.set(matchName, new Highlight(...prose));
    } else {
      registry.delete(matchName);
    }
    if (shown?.kind === 'prose') {
      registry.set(currentName, new Highlight(shown.range));
    } else {
      registry.delete(currentName);
    }
  }
  const finds = new Map<Element, Map<number, FindMark[]>>();
  for (const match of matches) {
    if (match.kind !== 'code') {
      continue;
    }
    const lines = finds.get(match.code) ?? new Map<number, FindMark[]>();
    finds.set(match.code, lines);
    const marks = lines.get(match.line) ?? [];
    lines.set(match.line, marks);
    marks.push({
      start: match.start,
      end: match.end,
      current: match === shown,
    });
  }
  blocks?.found(finds, searching);
}

function measured(range: StaticRange): DOMRect {
  const scratch = scratchRange();
  scratch.setStart(range.startContainer, range.startOffset);
  scratch.setEnd(range.endContainer, range.endOffset);
  return scratch.getBoundingClientRect();
}

export function openedTo(match: MarkdownMatch): void {
  let child: Node =
    match.kind === 'code' ? match.code : match.range.startContainer;
  for (
    let parent = child.parentElement;
    parent !== null;
    child = parent, parent = parent.parentElement
  ) {
    const summary = isElement(child) && child.tagName === 'SUMMARY';
    if (parent.tagName === 'DETAILS' && !summary) {
      parent.setAttribute('open', '');
    }
  }
}

export function revealMarkdownMatch(
  match: MarkdownMatch | undefined,
  blocks: CodeFinds | undefined,
  scroller: Element | null,
): void {
  if (match === undefined || scroller === null) {
    return;
  }
  openedTo(match);
  const box =
    match.kind === 'prose'
      ? measured(match.range)
      : blocks?.boxOf(match.code, match.line, match.start, match.end);
  if (box === undefined) {
    return;
  }
  const sight = scroller.getBoundingClientRect();
  if (box.top < sight.top || box.bottom > sight.bottom) {
    scroller.scrollTop += box.top - sight.top - sight.height / 3;
  }
  const pre = match.kind === 'code' ? match.code.closest('pre') : null;
  const across = pre?.getBoundingClientRect();
  if (
    pre !== null &&
    across !== undefined &&
    (box.left < across.left || box.right > across.right)
  ) {
    pre.scrollLeft += box.left - across.left - across.width / 3;
  }
}
