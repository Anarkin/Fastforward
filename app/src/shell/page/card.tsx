import { Fragment } from 'react';
import { shellKeymap } from '../shared/keymap';
import { keysOf } from '../../lib/shared/keymap';
import { CloseIcon, ErrorIcon } from '../../lib/page/icons';
import { KeyCombo } from '../../lib/page/keyCombo';
import { Words } from '../../lib/page/name';
import { labelTip, type TipRow } from '../../lib/page/tips';
import type { Sentence } from '../../lib/shared/sentences';
import { strings } from '../../lib/shared/strings';

export function Card({
  kind,
  said,
  error = false,
  keys,
  rows,
  onClose,
  ...rest
}: {
  readonly kind: 'notice' | 'tip';
  readonly said: Sentence;
  readonly error?: boolean;
  readonly keys?: string;
  readonly rows?: readonly TipRow[] | undefined;
  readonly onClose?: () => void;
} & Omit<React.ComponentProps<'div'>, 'className' | 'children'>) {
  const detailed = rows !== undefined && rows.length > 0;
  return (
    <div
      {...rest}
      className={`card ${kind} ${error ? 'error' : 'info'}${detailed ? ' detailed' : ''}`}
    >
      {error && <ErrorIcon />}
      <span className="card-message">
        <Words>{said}</Words>
      </span>
      {keys !== undefined && (
        <span className="shortcut-keys">
          {keys.split(' ').map((combo) => (
            <KeyCombo key={combo} keys={combo} />
          ))}
        </span>
      )}
      {onClose && (
        <button
          className="card-close"
          {...labelTip(strings.messages.dismiss, {
            keys: keysOf(shellKeymap.dismissNotice),
          })}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      )}
      {detailed && (
        <span className="card-details">
          {rows?.map(({ name, values }) => (
            <Fragment key={name}>
              <span className="card-row-name">{name}</span>
              <code className="card-row-values">{values}</code>
            </Fragment>
          ))}
        </span>
      )}
    </div>
  );
}
