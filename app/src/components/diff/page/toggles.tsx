import { diffKeymap } from './keymap';
import { keysOf } from '../../../lib/shared/keymap';
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
import { Toolbar } from '../../../lib/page/toolbar';

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
    <Toolbar className="diff-options">
      <button
        className={`nav-button toggle ${entire ? 'active' : ''}`}
        {...labelTip(strings.diff.showEntireFile)}
        aria-pressed={entire}
        onClick={() => onEntire(!entire)}
      >
        <EntireFileIcon />
      </button>
      {language}
      <button
        className={`nav-button toggle ${showWhitespace ? 'active' : ''}`}
        {...labelTip(strings.common.showWhitespace, {
          keys: keysOf(diffKeymap.showWhitespace),
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
      <button
        className={`nav-button toggle ${wordWrap ? 'active' : ''}`}
        {...labelTip(strings.common.wrap, { keys: keysOf(diffKeymap.wrap) })}
        aria-pressed={wordWrap}
        onClick={() => onWordWrap(!wordWrap)}
      >
        <WordWrapIcon />
      </button>
      <Toolbar
        className="segmented"
        role="group"
        aria-label={strings.diff.layout}
      >
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
      </Toolbar>
    </Toolbar>
  );
}
