import type { CursorStyle } from '../../../lib/shared/cursorSettings';

export type ModeParams = readonly (number | readonly number[])[];

const cursorMode = 25;

export const setsMode = (
  params: ModeParams,
  modes: readonly number[],
): boolean =>
  params.some((param) =>
    (typeof param === 'number' ? [param] : param).some((mode) =>
      modes.includes(mode),
    ),
  );

export const setsCursorMode = (params: ModeParams): boolean =>
  setsMode(params, [cursorMode]);

export type ProgramCursor =
  | 'reset'
  | { readonly style: CursorStyle | undefined; readonly blink: boolean };

const programStyles: readonly (CursorStyle | undefined)[] = [
  undefined,
  'block',
  'block',
  'underline',
  'underline',
  'bar',
  'bar',
];

export function programCursor(params: ModeParams): ProgramCursor {
  const [first = 0] = params;
  const param = typeof first === 'number' ? first : (first[0] ?? 0);
  return param === 0
    ? 'reset'
    : { style: programStyles[param], blink: param % 2 === 1 };
}

const blinkOnly = 7;

export function programCursorSequence(
  style: CursorStyle | undefined,
  blink: boolean | undefined,
): string {
  if (blink === undefined) {
    return '';
  }
  const shape = programStyles.indexOf(style);
  const param = (shape > 0 ? shape : blinkOnly) + (blink ? 0 : 1);
  return `\x1b[${param} q`;
}
