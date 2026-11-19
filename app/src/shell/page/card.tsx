import { shellKeymap } from '../shared/keymap';
import { keysOf } from '../../lib/shared/keymap';
import { CloseIcon, ErrorIcon } from '../../lib/page/icons';
import { KeyCombo } from '../../lib/page/keyCombo';
import { Words } from '../../lib/page/name';
import { labelTip } from '../../lib/page/tips';
import type { Sentence } from '../../lib/shared/sentences';
import { strings } from '../../lib/shared/strings';

export function Card({
  kind,
  said,
  error = false,
  keys,
  onClose,
  ...rest
}: {
  readonly kind: 'notice' | 'tip';
  readonly said: Sentence;
  readonly error?: boolean;
  readonly keys?: string;
  readonly onClose?: () => void;
} & Omit<React.ComponentProps<'div'>, 'className' | 'children'>) {
  return (
    <div {...rest} className={`card ${kind} ${error ? 'error' : 'info'}`}>
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
    </div>
  );
}
