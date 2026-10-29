export const renderers = ['webgl', 'dom'] as const;

export type Renderer = (typeof renderers)[number];

export interface TerminalSettings {
  readonly shell: string;
  readonly shellArgs: readonly string[];
  readonly renderer: Renderer;
}
