import type { ContextMenuItem } from '../../../lib/page/contextMenu';

export function driveMenu(
  drives: readonly string[],
  current: string | undefined,
  onDrive: (drive: string) => void,
): readonly ContextMenuItem[] {
  return drives.map((drive) => ({
    label: drive,
    name: true,
    accessKey: drive.charAt(0),
    checked: drive === current,
    onClick: () => onDrive(drive),
  }));
}
