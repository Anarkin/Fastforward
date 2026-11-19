import type { Box } from './scrollbarsShown';

export const views = {
  commander: {
    tab: 0,
    rows: '.commander-pane:not(.inactive) .virtual-row',
    vertical: '.commander-pane:not(.inactive) .virtual-rows',
    horizontal: undefined,
    marks: undefined,
  },
  viewer: {
    tab: 1,
    rows: '.viewer-row:not(.viewer-probe)',
    vertical: '.viewer-body .scroll-proxy.vertical',
    horizontal: '.viewer-sideways',
    marks: '.viewer-body .scrollbar-marks',
  },
  editor: {
    tab: 2,
    rows: '.editor .cm-line',
    vertical: '.editor .cm-scroller',
    horizontal: '.editor .cm-editor > .scroll-proxy-frame .scroll-proxy',
    marks: undefined,
  },
  diff: {
    tab: 3,
    rows: '.diff-view .virtual-row',
    vertical: '.diff-view > .virtual-rows',
    horizontal: '.diff-view .scroll-proxy.horizontal',
    marks: '.diff-view > .scrollbar-marks',
  },
  'commit list': {
    tab: 4,
    rows: '.virtual-rows.list .virtual-row',
    vertical: '.virtual-rows.list',
    horizontal: undefined,
    marks: undefined,
  },
} as const;

export type ViewName = keyof typeof views;

export const everyView: readonly ViewName[] = [
  'commander',
  'viewer',
  'editor',
  'diff',
  'commit list',
];

export const textViews: readonly ViewName[] = ['viewer', 'editor', 'diff'];

export const previews = {
  Markdown: { tab: 5, vertical: '.viewer-preview' },
  PDF: { tab: 6, vertical: '.viewer-pdf .pdf-scroll' },
} as const;

export const near = (one = '', other = '') =>
  one.length === 6 &&
  other.length === 6 &&
  [0, 2, 4].every(
    (at) =>
      Math.abs(
        parseInt(one.slice(at, at + 2), 16) -
          parseInt(other.slice(at, at + 2), 16),
      ) <= 6,
  );

export const middle = (box: Box) => ({
  x: box.left + box.width / 2,
  y: box.top + box.height / 2,
});

export const alike = <T>(names: readonly string[], value: T) =>
  Object.fromEntries(names.map((name) => [name, value]));
