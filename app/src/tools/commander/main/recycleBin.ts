export type Hive = 'currentUser' | 'localMachine';

export interface WindowsRegistry {
  readonly volumeOf: (folder: string) => Promise<string | undefined>;
  readonly number: (
    hive: Hive,
    key: string,
    name: string,
  ) => number | undefined;
}

const policies =
  'Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer';
const volumes =
  'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\BitBucket\\Volume';
const volumeId = /\{[0-9a-f-]{36}\}/i;

export async function recycleBinOff(
  { volumeOf, number }: WindowsRegistry,
  folder: string,
): Promise<boolean> {
  const policy =
    number('localMachine', policies, 'NoRecycleFiles') ??
    number('currentUser', policies, 'NoRecycleFiles') ??
    0;
  if (policy !== 0) {
    return true;
  }
  const id = volumeId.exec((await volumeOf(folder)) ?? '')?.[0];
  return (
    id !== undefined &&
    (number('currentUser', `${volumes}\\${id}`, 'NukeOnDelete') ?? 0) !== 0
  );
}
