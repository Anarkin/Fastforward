import * as path from 'node:path';

export function profileFolder(
  development: boolean,
  given: string,
  appData: string,
): string | undefined {
  return (
    given || (development ? path.join(appData, 'Fastforward Dev') : undefined)
  );
}
