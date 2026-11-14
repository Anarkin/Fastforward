export const cursorStyles = ['block', 'bar', 'underline'] as const;

export type CursorStyle = (typeof cursorStyles)[number];

export interface CursorLook {
  readonly style: CursorStyle;
  readonly barWidth: number;
  readonly blink: boolean;
}

export const defaultCursorLook: CursorLook = {
  style: 'block',
  barWidth: 2,
  blink: false,
};

export const cursorVariables = {
  style: '--cursor-style',
  barWidth: '--cursor-bar-width',
  blink: '--cursor-blink',
} as const;

const narrowestBar = 1;
const widestBar = 10;

function isCursorStyle(value: string): value is CursorStyle {
  return cursorStyles.some((style) => style === value);
}

export function cursorLookOf(read: (name: string) => string): CursorLook {
  const style = read(cursorVariables.style).trim();
  const barWidth = Number.parseFloat(read(cursorVariables.barWidth));
  return {
    style: isCursorStyle(style) ? style : defaultCursorLook.style,
    barWidth: Number.isFinite(barWidth)
      ? Math.min(widestBar, Math.max(narrowestBar, Math.round(barWidth)))
      : defaultCursorLook.barWidth,
    blink: read(cursorVariables.blink).trim() === 'on',
  };
}
