import type { ContextMenuItem } from '../../../lib/page/contextMenuItem';

export function driveMenu(
  drives: readonly string[],
  current: string | undefined,
  onDrive: (drive: string) => void,
): readonly ContextMenuItem[] {
  return drives.map((drive) => ({
    label: drive,
    path: true,
    accessKey: drive.charAt(0),
    showAccessKey: true,
    checked: drive === current,
    onClick: () => onDrive(drive),
  }));
}

export function driveOf(
  folder: string,
  drives: readonly string[],
): string | undefined {
  return drives.find((drive) =>
    folder.toUpperCase().startsWith(drive.toUpperCase()),
  );
}
