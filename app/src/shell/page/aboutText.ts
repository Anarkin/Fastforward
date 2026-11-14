import type { AboutInfo } from '../shared/protocol';
import { brand, strings } from '../../lib/shared/strings';

export function aboutText({
  version,
  development,
  git,
  system,
}: AboutInfo): string {
  return [
    brand,
    strings.about.version(version, development),
    strings.about.address,
    strings.about.git(git),
    system,
  ].join('\n');
}
