import {
  EntireFileIcon,
  WhitespaceChangesIcon,
  ShowWhitespaceIcon,
  InlineIcon,
  SideBySideIcon,
  WordWrapIcon,
} from './icons';
import type { DiffLayout } from '../shared/changes';
import { strings } from '../shared/strings';

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
        title={strings.diff.showEntireFile}
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
        title={strings.common.showWhitespace}
        aria-pressed={showWhitespace}
        onClick={() => onShowWhitespace(!showWhitespace)}
      >
        <ShowWhitespaceIcon />
      </button>
      <button
        className={`nav-button toggle ${ignoreWhitespace ? '' : 'active'}`}
        title={strings.diff.showWhitespaceChanges}
        aria-pressed={!ignoreWhitespace}
        onClick={() => onIgnoreWhitespace(!ignoreWhitespace)}
      >
        <WhitespaceChangesIcon />
      </button>
      <span className="nav-button-space" />
      <button
        className={`nav-button toggle ${wordWrap ? 'active' : ''}`}
        title={strings.common.wrap}
        aria-pressed={wordWrap}
        onClick={() => onWordWrap(!wordWrap)}
      >
        <WordWrapIcon />
      </button>
      <span className="nav-button-space" />
      <div className="segmented" role="group" aria-label={strings.diff.layout}>
        <button
          className={`nav-button toggle ${layout === 'inline' ? 'active' : ''}`}
          title={strings.diff.inline}
          aria-pressed={layout === 'inline'}
          onClick={() => onLayout('inline')}
        >
          <InlineIcon />
        </button>
        <button
          className={`nav-button toggle ${layout === 'sideBySide' ? 'active' : ''}`}
          title={strings.diff.sideBySide}
          aria-pressed={layout === 'sideBySide'}
          onClick={() => onLayout('sideBySide')}
        >
          <SideBySideIcon />
        </button>
      </div>
    </div>
  );
}
