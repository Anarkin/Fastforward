import type { Elevation } from '../shell/shared/protocol';

export async function runsElevated(
  platform: NodeJS.Platform,
  userId: number | undefined = process.getuid?.(),
  windows: () => Promise<boolean> = async () =>
    (await import('./windowsElevated.js')).windowsElevated(),
): Promise<Elevation | undefined> {
  if (platform !== 'win32') {
    return userId === 0 ? 'root' : undefined;
  }
  try {
    return (await windows()) ? 'administrator' : undefined;
  } catch {
    return undefined;
  }
}
