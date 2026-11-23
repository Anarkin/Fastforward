import { clicked } from '../../../lib/shared/keymap';
import { keymap } from '../../../lib/page/keymap';
import { viewerKeymap } from './keymap';
import { signedRegion } from '../../../lib/page/signedCopy';
import {
  useEffect,
  useContext,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { mermaidDrawer, showDiagrams } from './diagrams';
import { markdownRenderer, type Render } from './markdownRender';
import { onceMade } from '../../../lib/page/onceMade';
import { colorCode } from '../../../components/syntax/page/colorer';
import { elementWidths, fontOf, spacingOf } from '../../../lib/page/textWidths';
import { useCellTable } from '../../../lib/page/cellTable';
import { fontDotLook } from '../../../lib/page/dotLook';
import { useShell } from '../../../shell/page/store';
import { CodeBlocks } from './codeBlocks';
import type { CodeLook } from './codeCells';
import { showBlocks, showImages, type MarkdownImages } from './markdownBlocks';
import {
  markdownMatches,
  revealMarkdownMatch,
  showMarkdownMatches,
  type MarkdownMatch,
} from './markdownFind';
import type { MarkdownFindControls } from './markdownFinds';
import { plainSearch, type Search } from '../../../lib/shared/searchOptions';
import { documentLink, type DocumentLink } from './documentLinks';
import { anchorAttribute, linkAttribute } from './markdownRender';
import { PathMenuContext } from '../../../lib/page/pathMenu';

const codeLanguage = /(?:^|\s)language-(\S+)/;

const drawnCode = 'pre > code:not(.language-mermaid)';

function drawCodeBlocks(element: Element, blocks: CodeBlocks): () => void {
  const leaving = new AbortController();
  for (const code of element.querySelectorAll<HTMLElement>(drawnCode)) {
    const language = codeLanguage.exec(code.className)?.[1];
    const text = code.textContent;
    blocks.add(code, text);
    if (language === undefined) {
      continue;
    }
    void colorCode(language, text, leaving.signal).then((lines) => {
      if (!leaving.signal.aborted && lines) {
        blocks.colored(code, lines);
      }
    });
  }
  return () => {
    leaving.abort();
    blocks.removeIn(element);
  };
}

function codeLookOf(
  code: Element,
  widths: ReturnType<typeof elementWidths>,
  showWhitespace: boolean,
  marking: boolean,
): CodeLook | undefined {
  if (widths === undefined) {
    return undefined;
  }
  const family = fontOf(code);
  return {
    font: { char: widths.char, family, spacing: spacingOf(code) },
    dotLook: fontDotLook(family, widths.char, 1 / devicePixelRatio),
    widths,
    showWhitespace,
    marking,
  };
}

let loaded: Render | undefined;

const loadRenderer = onceMade(() =>
  Promise.all([import('dompurify'), import('markdown-it')]).then(
    ([{ default: purify }, { default: markdownIt }]) => {
      const render = markdownRenderer(purify(window), markdownIt);
      loaded = render;
      return render;
    },
  ),
);

function useRenderer(): Render | undefined {
  const [render, setRender] = useState(() => loaded);
  useEffect(() => {
    if (render) {
      return undefined;
    }
    let live = true;
    loadRenderer().then((ready) => {
      if (live) {
        setRender(() => ready);
      }
    }, reportError);
    return () => {
      live = false;
    };
  }, [render]);
  return render;
}

const noImages = () => undefined;

const loadMermaid = onceMade(() =>
  import('mermaid').then(({ default: mermaid }) => mermaid),
);

const darkScheme = '(prefers-color-scheme: dark)';

function useDark(): boolean {
  return useSyncExternalStore(
    (changed) => {
      const query = matchMedia(darkScheme);
      query.addEventListener('change', changed);
      return () => query.removeEventListener('change', changed);
    },
    () => matchMedia(darkScheme).matches,
    () => false,
  );
}

function stopDrawing(blocks: Map<Element, () => void>): void {
  for (const stop of blocks.values()) {
    stop();
  }
  blocks.clear();
}

const noMatches: readonly MarkdownMatch[] = [];

export interface MarkdownLinks {
  readonly document: string;
  readonly follow: (link: DocumentLink) => void;
  readonly anchor?: string | undefined;
  readonly anchored?: () => void;
}

const slashed = (path: string) => path.replaceAll('\\', '/');

function headingOf(element: Element, anchor: string): Element | undefined {
  const headings = [...element.querySelectorAll(`[${anchorAttribute}]`)];
  const named = (name: string) =>
    headings.find((heading) => heading.getAttribute(anchorAttribute) === name);
  return named(anchor) ?? named(anchor.toLowerCase());
}

function scrolledTo(element: Element, anchor: string): boolean {
  const heading = headingOf(element, anchor);
  const scroller = element.closest('.viewer-body');
  if (heading === undefined || scroller === null) {
    return false;
  }
  scroller.scrollTop +=
    heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  return true;
}

function linkAt(
  element: Element | null,
  event: React.MouseEvent,
  document: string,
): DocumentLink | undefined {
  const path = event.nativeEvent.composedPath();
  const link = [
    ...(element?.querySelectorAll(`a[${linkAttribute}]`) ?? []),
  ].find((each) => path.includes(each));
  const href = link?.getAttribute(linkAttribute);
  return href === null || href === undefined
    ? undefined
    : documentLink(document, href);
}

export function MarkdownPane({
  text,
  images,
  find,
  links,
}: {
  text: string | undefined;
  images: MarkdownImages | undefined;
  find?: MarkdownFindControls | undefined;
  links?: MarkdownLinks | undefined;
}) {
  const render = useRenderer();
  const table = useCellTable();
  const dark = useDark();
  const imagePathOf = images?.path;
  const imageUrlOf = images?.url;
  const html = useMemo(() => {
    if (!render || text === undefined || table === undefined) {
      return undefined;
    }
    return render(text, imagePathOf ?? noImages);
  }, [render, text, imagePathOf, table]);
  const showWhitespace = useShell((state) => state.textView.showWhitespace);
  const marking = useShell((state) => state.textView.highlightOccurrences);
  const content = useRef<HTMLDivElement>(null);
  const code = useRef<CodeBlocks>(undefined);
  const drawn = useRef(new Map<Element, () => void>());
  const drawnDark = useRef(dark);
  const showDocumentImages = useEffectEvent((element: ParentNode) => {
    if (imageUrlOf !== undefined) {
      showImages(element, imageUrlOf);
    }
  });
  useLayoutEffect(() => {
    const element = content.current;
    if (!element || html === undefined) {
      return;
    }
    if (drawnDark.current !== dark) {
      stopDrawing(drawn.current);
      element.replaceChildren();
      drawnDark.current = dark;
    }
    const { added, removed } = showBlocks(element, html);
    for (const block of removed) {
      drawn.current.get(block)?.();
      drawn.current.delete(block);
    }
    const drawer = () =>
      loadMermaid().then((mermaid) =>
        mermaidDrawer(mermaid, {
          dark,
          fontFamily: getComputedStyle(element).fontFamily,
        }),
      );
    const blocks = (code.current ??= new CodeBlocks(element));
    const first = element.querySelector(drawnCode);
    if (first !== null && table !== undefined) {
      blocks.relooked(
        codeLookOf(first, elementWidths(first, table), showWhitespace, marking),
      );
    }
    for (const block of added) {
      const stopColoring = drawCodeBlocks(block, blocks);
      const stopDiagrams = showDiagrams(block, drawer);
      drawn.current.set(block, () => {
        stopColoring();
        stopDiagrams();
      });
    }
    showDocumentImages(element);
  }, [html, dark, table, showWhitespace, marking]);
  const query = find?.query ?? '';
  const options = find?.options ?? plainSearch;
  const current = find?.current ?? 0;
  const jump = find?.jump ?? 0;
  const matches = useRef(noMatches);
  const shownAt = useRef(current);
  const marked = useEffectEvent((at: number) => {
    shownAt.current = Math.min(at, matches.current.length - 1);
    showMarkdownMatches(
      matches.current,
      shownAt.current,
      code.current,
      query !== '',
    );
  });
  const found = useEffectEvent((count: number) => find?.onFound(count));
  const searchAgain = useEffectEvent(
    (shown: {
      readonly html: string | undefined;
      readonly redrawnBy: readonly unknown[];
      readonly search: Search;
    }) => {
      const element = content.current;
      if (!element || shown.html === undefined) {
        return;
      }
      matches.current = markdownMatches(
        element,
        (each) => code.current?.textOf(each),
        shown.search.query,
        shown.search.options,
      );
      marked(current);
      found(matches.current.length);
    },
  );
  useLayoutEffect(
    () =>
      searchAgain({
        html,
        redrawnBy: [dark, table, showWhitespace, marking],
        search: { query, options },
      }),
    [html, dark, table, showWhitespace, marking, query, options],
  );
  useLayoutEffect(() => marked(current), [current]);
  const jumped = useRef(jump);
  useEffect(() => {
    if (jumped.current === jump) {
      return;
    }
    jumped.current = jump;
    revealMarkdownMatch(
      matches.current[shownAt.current],
      code.current,
      content.current?.closest('.viewer-body') ?? null,
    );
  }, [jump]);
  useEffect(() => {
    const element = content.current;
    const blocks = drawn.current;
    return () => {
      showMarkdownMatches(noMatches, 0, code.current, false);
      stopDrawing(blocks);
      code.current?.dispose();
      code.current = undefined;
      element?.replaceChildren();
    };
  }, []);
  useLayoutEffect(() => {
    if (content.current && html !== undefined && imageUrlOf !== undefined) {
      showImages(content.current, imageUrlOf);
    }
  }, [html, imageUrlOf]);
  const anchor = links?.anchor;
  const anchored = useEffectEvent(() => links?.anchored?.());
  useEffect(() => {
    const element = content.current;
    if (element && html !== undefined && anchor !== undefined) {
      scrolledTo(element, anchor);
      anchored();
    }
  }, [html, anchor]);
  const openPathMenu = useContext(PathMenuContext);
  const followed = (event: React.MouseEvent) => {
    const link =
      links === undefined
        ? undefined
        : linkAt(content.current, event, links.document);
    if (
      links === undefined ||
      link === undefined ||
      clicked(viewerKeymap.followLink, event) === undefined
    ) {
      return;
    }
    event.preventDefault();
    const element = content.current;
    if (slashed(link.path) === slashed(links.document)) {
      if (element) {
        scrolledTo(element, link.anchor);
      }
      return;
    }
    links.follow(link);
  };
  const askedMenu = (event: React.MouseEvent) => {
    const link =
      links === undefined
        ? undefined
        : linkAt(content.current, event, links.document);
    if (
      link === undefined ||
      slashed(link.path) === slashed(links?.document ?? '')
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openPathMenu({
      path: link.path,
      file: true,
      at: { x: event.clientX, y: event.clientY },
      extended: clicked(keymap.systemMenu, event) !== undefined,
    });
  };
  return (
    <div className="markdown-pane">
      <div
        ref={content}
        className="markdown"
        {...signedRegion}
        onClick={followed}
        onContextMenu={askedMenu}
      />
    </div>
  );
}
