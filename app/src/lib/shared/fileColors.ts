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
