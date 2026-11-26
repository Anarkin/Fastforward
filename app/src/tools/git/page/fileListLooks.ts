import { layerOf } from '../../../components/cells/page/cellLook';
import { strings } from '../../../lib/shared/strings';
import {
  probed,
  shapedSample,
  textScaleOf,
} from '../../../components/cells/page/listLooks';
import { over, type Rgba } from './commitListLooks';

const changeKinds = [
  'added',
  'modified',
  'deleted',
  'renamed',
  'conflict',
] as const;

export interface TextFont {
  readonly family: string;
  readonly size: number;
  readonly weight: string;
}

export interface FileListLooks {
  readonly ground: Rgba;
  readonly hover: Rgba;
  readonly selected: Rgba;
  readonly border: Rgba;
  readonly ink: string;
  readonly selectedInk: string;
  readonly twistyInk: string;
  readonly mutedOpacity: number;
  readonly mono: TextFont;
  readonly proportional: TextFont;
  readonly header: TextFont;
  readonly monoBaseline: number;
  readonly proportionalBaseline: number;
  readonly twistyBaseline: number;
  readonly markLeft: number;
  readonly fileNameLeft: number;
  readonly twistyLeft: number;
  readonly folderNameLeft: number;
  readonly headerLeft: number;
  readonly rightPadding: number;
  readonly kinds: ReadonlyMap<string, string>;
  readonly markInk: string;
  readonly markGround: Rgba;
  readonly markTop: number;
  readonly markHeight: number;
  readonly textScale: number;
  readonly partInk: (fileColor: string | undefined, hidden: boolean) => string;
  readonly dispose: () => void;
}

const fontOf = (style: CSSStyleDeclaration): TextFont => ({
  family: style.fontFamily,
  size: parseFloat(style.fontSize),
  weight: style.fontWeight,
});

export function fileListLooksOf(
  list: HTMLElement,
  scale: number,
): FileListLooks {
  const probe = probed(
    list,
    `<div class="row group" data-header><span class="path">a<span data-proportional-baseline></span></span></div>` +
      `<div class="row tree-row folder" data-folder><span class="change-mark" aria-hidden="true">  </span><span class="tree-indent" style="width:0"></span><span class="twisty">${strings.symbols.closed}<span data-twisty-baseline></span></span><span class="path path-cut">a<span data-mono-baseline></span></span></div>` +
      `<div class="row tree-row file" data-file><span class="change-mark modified">M </span><span class="tree-indent" style="width:10px"></span><span class="path path-cut" data-sample></span></div>` +
      `<div class="row tree-row file selected" data-selected><span class="path path-cut">a</span></div>` +
      `<div class="row tree-row file"><span class="path unchanged" data-unchanged>a</span></div>` +
      changeKinds
        .map(
          (kind) =>
            `<div class="row tree-row file"><span class="change-mark ${kind}" data-kind="${kind}">A </span></div>`,
        )
        .join('') +
      `<div class="row tree-row file" data-marked><span class="path path-cut" data-mark-host></span></div>` +
      `<div class="row tree-row file"><span class="path path-cut" data-part>a</span></div>` +
      `<span data-hover></span><span data-border></span>`,
  );
  const at = (selector: string) => {
    const element = probe.querySelector<HTMLElement>(selector);
    if (element === null) {
      throw new Error(`No ${selector} to read the files list from`);
    }
    return element;
  };
  const left = (row: string, part: string) =>
    at(`${row} ${part}`).getBoundingClientRect().left -
    at(row).getBoundingClientRect().left;
  const baselineOf = (row: string, mark: string) => {
    const element = at(mark);
    element.style.display = 'inline-block';
    element.style.verticalAlign = 'baseline';
    element.style.height = '0';
    return (
      element.getBoundingClientRect().bottom -
      at(row).getBoundingClientRect().top
    );
  };
  const hover = at('[data-hover]');
  hover.style.background = 'var(--hover-background)';
  const border = at('[data-border]');
  border.style.background = 'var(--color-border)';
  const marked = document.createElement('mark');
  marked.className = 'match';
  marked.textContent = 'a';
  at('[data-mark-host]').append(marked);
  const sample = at('[data-sample]');
  sample.textContent = shapedSample;
  const part = at('[data-part]');
  const inks = new Map<string, string>();
  const row = at('[data-file]');
  const looks: FileListLooks = {
    ground: over([0, 0, 0, 1], layerOf(list)),
    hover: layerOf(hover),
    selected: layerOf(at('[data-selected]')),
    border: layerOf(border),
    ink: getComputedStyle(at('[data-file] .path')).color,
    selectedInk: getComputedStyle(at('[data-selected] .path')).color,
    twistyInk: getComputedStyle(at('[data-folder] .twisty')).color,
    mutedOpacity: Number(getComputedStyle(at('[data-unchanged]')).opacity),
    mono: fontOf(getComputedStyle(at('[data-folder] .path'))),
    proportional: fontOf(getComputedStyle(at('[data-folder] .twisty'))),
    header: fontOf(getComputedStyle(at('[data-header] .path'))),
    monoBaseline: baselineOf('[data-folder]', '[data-mono-baseline]'),
    proportionalBaseline: baselineOf(
      '[data-header]',
      '[data-proportional-baseline]',
    ),
    twistyBaseline: baselineOf('[data-folder]', '[data-twisty-baseline]'),
    markLeft: left('[data-file]', '.change-mark'),
    fileNameLeft: left('[data-file]', '.path'),
    twistyLeft: left('[data-folder]', '.twisty'),
    folderNameLeft: left('[data-folder]', '.path'),
    headerLeft: left('[data-header]', '.path'),
    rightPadding: parseFloat(getComputedStyle(row).paddingRight) || 0,
    kinds: new Map(
      changeKinds.map((kind) => [
        kind,
        getComputedStyle(at(`[data-kind="${kind}"]`)).color,
      ]),
    ),
    markInk: getComputedStyle(marked).color,
    markGround: over([0, 0, 0, 1], layerOf(marked)),
    markTop:
      marked.getBoundingClientRect().top -
      at('[data-marked]').getBoundingClientRect().top,
    markHeight: marked.getBoundingClientRect().height,
    textScale: textScaleOf(sample, scale),
    partInk: (fileColor, hidden) => {
      const key = `${fileColor ?? ''}|${hidden}`;
      const known = inks.get(key);
      if (known !== undefined) {
        return known;
      }
      part.className = [
        'path',
        'path-cut',
        ...(fileColor === undefined ? [] : ['colored']),
        ...(hidden ? ['hidden'] : []),
      ].join(' ');
      if (fileColor === undefined) {
        part.style.removeProperty('--file-color');
      } else {
        part.style.setProperty('--file-color', fileColor);
      }
      const ink = getComputedStyle(part).color;
      inks.set(key, ink);
      return ink;
    },
    dispose: () => probe.remove(),
  };
  return looks;
}
