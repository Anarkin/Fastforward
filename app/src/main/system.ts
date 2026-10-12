import { strings } from '../shared/strings';

const windows11Build = 22_000;

export interface SystemFacts {
  readonly platform: string;
  readonly release: string;
  readonly arch: string;
  readonly systemVersion?: string;
  readonly distribution?: string;
}

export function systemOf({
  platform,
  release,
  arch,
  systemVersion,
  distribution,
}: SystemFacts): string {
  switch (platform) {
    case 'win32': {
      const build = release.split('.')[2] ?? release;
      return strings.about.windows(
        Number(build) >= windows11Build ? '11' : '10',
        build,
        arch,
      );
    }
    case 'darwin':
      return strings.about.macos(systemVersion ?? release, arch);
    case 'linux':
      return strings.about.linux(distribution, release, arch);
    default:
      return strings.about.otherSystem(platform, release, arch);
  }
}

export function prettyName(osRelease: string): string | undefined {
  const line = osRelease
    .split('\n')
    .find((entry) => entry.startsWith('PRETTY_NAME='));
  return line
    ?.slice('PRETTY_NAME='.length)
    .trim()
    .replace(/^"(.*)"$/, '$1');
}
