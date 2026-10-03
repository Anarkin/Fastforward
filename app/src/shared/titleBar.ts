export const titleBarHeight = 32;

export const appNameSwitch = '--fastforward-app-name=';

export function appName(version: string, development: boolean): string {
  return `Fastforward ${version}${development ? ' Dev' : ''}`;
}
