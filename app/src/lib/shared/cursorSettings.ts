export const cursorStyles = ['block', 'bar', 'underline', 'outline'] as const;

export type CursorStyle = (typeof cursorStyles)[number];

export interface CursorLook {
  readonly style: CursorStyle;
  readonly width: number;
  readonly blink: boolean;
}

export const defaultCursorLook: CursorLook = {
  style: 'block',
  width: 2,
  blink: false,
};

export const cursorVariables = {
  style: '--cursor-style',
  width: '--cursor-width',
  blink: '--cursor-blink',
} as const;

const thinnest = 1;
const thickest = 10;

function isCursorStyle(value: string): value is CursorStyle {
  return cursorStyles.some((style) => style === value);
}

export function cursorLookOf(read: (name: string) => string): CursorLook {
  const style = read(cursorVariables.style).trim();
  const width = Number.parseFloat(read(cursorVariables.width));
  return {
    style: isCursorStyle(style) ? style : defaultCursorLook.style,
    width: Number.isFinite(width)
      ? Math.min(thickest, Math.max(thinnest, Math.round(width)))
      : defaultCursorLook.width,
    blink: read(cursorVariables.blink).trim() === 'on',
  };
}
