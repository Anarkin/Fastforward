import { Fragment } from 'react';
import { keyParts } from '../shell/shared/keymap';
import { strings } from '../shared/strings';
import { folded } from '../shared/textMatches';
import { MouseIcon } from './icons';

function keyClass(pointer: boolean, matched: boolean): string | undefined {
  const names = [pointer && 'pointer', matched && 'match'].filter(Boolean);
  return names.length > 0 ? names.join(' ') : undefined;
}

export function KeyCombo({
  keys,
  matched,
}: {
  keys: string;
  matched?: ReadonlySet<string>;
}) {
  return (
    <span className="shortcut-combo">
      {keyParts(keys).map(({ label, pointer }, place) => (
        <Fragment key={place}>
          {place > 0 && (
            <span className="shortcut-joiner">{strings.shortcuts.joiner}</span>
          )}
          <kbd
            className={keyClass(pointer, matched?.has(folded(label)) ?? false)}
          >
            {pointer && <MouseIcon />}
            {label}
          </kbd>
        </Fragment>
      ))}
    </span>
  );
}
