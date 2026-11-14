import { comboOf, isPointerKey, usesMacKeys } from '../shared/keymap';
import { strings } from '../shared/strings';

export function keyLabels(keys: string, mac = usesMacKeys()): string[] {
  const combo = comboOf(keys);
  const names: Readonly<Record<string, string>> = strings.keys;
  return [
    ...(combo.mod ? [mac ? strings.keys.Command : strings.keys.Ctrl] : []),
    ...(combo.ctrl ? [strings.keys.Ctrl] : []),
    ...(combo.alt ? [mac ? strings.keys.Option : strings.keys.Alt] : []),
    ...(combo.shift ? [strings.keys.Shift] : []),
    names[mac && combo.key === 'Alt' ? 'Option' : combo.key] ?? combo.key,
  ];
}

export interface KeyPart {
  readonly label: string;
  readonly pointer: boolean;
}

export function keyParts(keys: string, mac = usesMacKeys()): KeyPart[] {
  const { key } = comboOf(keys);
  const pointer = isPointerKey(key);
  const labels = keyLabels(keys, mac);
  return labels.map((label, place) => ({
    label,
    pointer: pointer && place === labels.length - 1,
  }));
}
