import type { WindowsPty } from '../shared/protocol';

export function windowsPtyOf(
  platform: NodeJS.Platform,
  release: string,
): WindowsPty | undefined {
  const buildNumber = Number(release.split('.')[2]);
  return platform === 'win32' && Number.isInteger(buildNumber)
    ? { backend: 'conpty', buildNumber }
    : undefined;
}
