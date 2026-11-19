import { diffKeymap } from './keymap';
import { keyOf } from '../../../lib/shared/keymap';
import { labelTip } from '../../../lib/page/tips';
import {
  EntireFileIcon,
  WhitespaceChangesIcon,
  ShowWhitespaceIcon,
  InlineIcon,
  SideBySideIcon,
  WordWrapIcon,
} from '../../../lib/page/icons';
import type { DiffLayout } from '../shared/protocol';
import { strings } from '../../../lib/shared/strings';

export function DiffToggles({
  language,
  entire,
  ignoreWhitespace,
  layout,
  wordWrap,
  showWhitespace,
  onEntire,
  onIgnoreWhitespace,
  onLayout,
  onWordWrap,
  onShowWhitespace,
}: {
  readonly language: React.ReactNode;
  readonly entire: boolean;
  readonly ignoreWhitespace: boolean;
  readonly layout: DiffLayout;
  readonly wordWrap: boolean;
  readonly showWhitespace: boolean;
  readonly onEntire: (entire: boolean) => void;
  readonly onIgnoreWhitespace: (ignore: boolean) => void;
  readonly onLayout: (layout: DiffLayout) => void;
  readonly onWordWrap: (wrap: boolean) => void;
  readonly onShowWhitespace: (show: boolean) => void;
}) {
  return (
    <div className="nav-buttons diff-options">
      <button
        className={`nav-button toggle ${entire ? 'active' : ''}`}
        {...labelTip(strings.diff.showEntireFile)}
        aria-pressed={entire}
        onClick={() => onEntire(!entire)}
      >
        <EntireFileIcon />
      </button>
      <span className="nav-button-space" />
      {language}
      <span className="nav-button-space" />
      <button
        className={`nav-button toggle ${showWhitespace ? 'active' : ''}`}
        {...labelTip(strings.common.showWhitespace, {
          keys: keyOf(diffKeymap.showWhitespace),
        })}
        aria-pressed={showWhitespace}
        onClick={() => onShowWhitespace(!showWhitespace)}
      >
        <ShowWhitespaceIcon />
      </button>
      <button
        className={`nav-button toggle ${ignoreWhitespace ? '' : 'active'}`}
        {...labelTip(strings.diff.showWhitespaceChanges)}
        aria-pressed={!ignoreWhitespace}
        onClick={() => onIgnoreWhitespace(!ignoreWhitespace)}
      >
        <WhitespaceChangesIcon />
      </button>
      <span className="nav-button-space" />
      <button
        className={`nav-button toggle ${wordWrap ? 'active' : ''}`}
        {...labelTip(strings.common.wrap, { keys: keyOf(diffKeymap.wrap) })}
        aria-pressed={wordWrap}
        onClick={() => onWordWrap(!wordWrap)}
      >
        <WordWrapIcon />
      </button>
      <span className="nav-button-space" />
      <div className="segmented" role="group" aria-label={strings.diff.layout}>
        <button
          className={`nav-button toggle ${layout === 'inline' ? 'active' : ''}`}
          {...labelTip(strings.diff.inline)}
          aria-pressed={layout === 'inline'}
          onClick={() => onLayout('inline')}
        >
          <InlineIcon />
        </button>
        <button
          className={`nav-button toggle ${layout === 'sideBySide' ? 'active' : ''}`}
          {...labelTip(strings.diff.sideBySide)}
          aria-pressed={layout === 'sideBySide'}
          onClick={() => onLayout('sideBySide')}
        >
          <SideBySideIcon />
        </button>
      </div>
    </div>
  );
}
