export const renderers = ['webgl', 'dom'] as const;

export type Renderer = (typeof renderers)[number];

export interface TerminalSettings {
  readonly shell: string;
  readonly shellArgs: readonly string[];
  readonly renderer: Renderer;
  readonly scrollback: number;
  readonly minimumContrastRatio: number;
}

const maxScrollback = 100_000;

export function scrollbackLines(value: number): number {
  return Number.isFinite(value)
    ? Math.min(maxScrollback, Math.max(0, Math.round(value)))
    : 0;
}

export function contrastRatio(value: number): number {
  return Number.isFinite(value) ? Math.min(21, Math.max(1, value)) : 1;
}
