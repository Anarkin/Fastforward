export const languagesGroup = 'languages';

export const executablesGroup = 'executables';

export const groupStandIns = [languagesGroup, executablesGroup] as const;

export type GroupStandIn = (typeof groupStandIns)[number];

export interface FileColor {
  readonly extensions: readonly string[] | GroupStandIn;
  readonly colors: { readonly light: string; readonly dark: string };
}

export function extensionKey(extension: string): string {
  return extension.replace(/^\./, '').toLowerCase();
}

export function fileColorClass(group: number): string {
  return `file-color-${group}`;
}

export function fileColorValue({ colors }: FileColor): string {
  return `light-dark(${colors.light}, ${colors.dark})`;
}
