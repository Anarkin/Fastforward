import koffi from 'koffi';
import type { ReadSavedPath } from './savedPath';

const machine = {
  hive: 0x8000_0002 | 0,
  key: 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
};
const user = { hive: 0x8000_0001 | 0, key: 'Environment' };
const stringsExpanded = 0x2;
const longestValue = 32_767;

export function windowsSavedPath(): ReadSavedPath {
  const getValue = koffi
    .load('advapi32.dll')
    .func(
      'int32_t RegGetValueW(intptr_t key, const char16_t *subKey, const char16_t *value, uint32_t flags, void *type, void *data, void *size)',
    );
  const foldersIn = ({ hive, key }: typeof user): string[] => {
    const data = Buffer.alloc((longestValue + 1) * 2);
    const size = Buffer.alloc(4);
    size.writeUInt32LE(data.length);
    if (
      Number(getValue(hive, key, 'Path', stringsExpanded, null, data, size)) !==
      0
    ) {
      return [];
    }
    const [text = ''] = data
      .toString('utf16le', 0, size.readUInt32LE())
      .split('\0');
    return text.split(';').filter(Boolean);
  };
  return () => [...foldersIn(machine), ...foldersIn(user)];
}
