import { Fragment } from 'react';
import { keyLabels } from '../shell/shared/keymap';
import { strings } from '../shared/strings';

export function KeyCombo({ keys }: { keys: string }) {
  return (
    <span className="shortcut-combo">
      {keyLabels(keys).map((label, place) => (
        <Fragment key={place}>
          {place > 0 && strings.shortcuts.joiner}
          <kbd>{label}</kbd>
        </Fragment>
      ))}
    </span>
  );
}
