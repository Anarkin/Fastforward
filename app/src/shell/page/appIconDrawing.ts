export const appIconColors = {
  sky: '#1A73E8',
  back: '#D88B00',
  front: '#FBBC04',
} as const;

const drawnSize = 480;

const drawn = {
  tabTop: 134,
  tabEnd: 198,
  cornerControl: 212,
  cornerEnd: { x: 221, y: 146 },
  stepEnd: 254,
  backTop: 190,
  frontTop: 254,
} as const;

export interface AppIconDrawing {
  readonly size: number;
  readonly tabTop: number;
  readonly tabEnd: number;
  readonly cornerControl: number;
  readonly cornerEnd: { readonly x: number; readonly y: number };
  readonly stepEnd: number;
  readonly backTop: number;
  readonly frontTop: number;
}

export function appIconDrawing(size = drawnSize): AppIconDrawing {
  const scale = size / drawnSize;
  const tabTop = Math.max(1, Math.round(drawn.tabTop * scale));
  const backTop = Math.max(tabTop + 1, Math.round(drawn.backTop * scale));
  const frontTop = Math.max(backTop + 1, Math.round(drawn.frontTop * scale));
  const bend =
    (drawn.cornerEnd.y - drawn.tabTop) / (drawn.backTop - drawn.tabTop);
  return {
    size,
    tabTop,
    tabEnd: drawn.tabEnd * scale,
    cornerControl: drawn.cornerControl * scale,
    cornerEnd: {
      x: drawn.cornerEnd.x * scale,
      y: tabTop + bend * (backTop - tabTop),
    },
    stepEnd: drawn.stepEnd * scale,
    backTop,
    frontTop,
  };
}

function written(length: number): string {
  return String(Number(length.toFixed(3)));
}

export function folderBackOutline(drawing: AppIconDrawing): string {
  const { size, tabTop, tabEnd, cornerControl, cornerEnd, stepEnd, backTop } =
    drawing;
  return [
    `M0 ${written(tabTop)}`,
    `H${written(tabEnd)}`,
    `Q${written(cornerControl)} ${written(tabTop)} ${written(cornerEnd.x)} ${written(cornerEnd.y)}`,
    `L${written(stepEnd)} ${written(backTop)}`,
    `H${written(size)}`,
    `V${written(size)}`,
    'H0',
    'Z',
  ].join(' ');
}
