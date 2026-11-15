import { useEffect, useRef } from 'react';
import { useShell, useShellActions } from '../../../shell/page/store';
import { languageKeyOf, pickedFor, useGit, useGitActions } from './store';
import { languageChoiceOf } from '../../../lib/page/languageMenu';
import { LanguageButton } from '../../../lib/page/languageChoice';
import { languageOf } from '../../../lib/page/languages';
import { useBinding } from '../../../lib/page/shortcuts';
import {
  EntireFileIcon,
  WhitespaceChangesIcon,
  ShowWhitespaceIcon,
  InlineIcon,
  SideBySideIcon,
  WordWrapIcon,
} from '../../../lib/page/icons';
import { gitKeymap } from './keymap';
import { strings } from '../../../lib/shared/strings';

export function DiffLanguage({ comparing }: { comparing: string | undefined }) {
  const key = useGit((state) => languageKeyOf(comparing, state.tab));
  const path = useGit((state) => state.tab.path);
  const compared = useGit(({ compare }) =>
    compare !== undefined && compare.tab === comparing
      ? compare.new
      : undefined,
  );
  const picked = useGit(pickedFor(key));
  const highlightSyntax = useShell((state) => state.textView.highlightSyntax);
  const { changeTextView } = useShellActions();
  const { pickLanguage, seeLanguageKey } = useGitActions();
  useEffect(() => seeLanguageKey(key), [key, seeLanguageKey]);
  const { choice, choose } = languageChoiceOf(
    key,
    {
      on: highlightSyntax,
      change: (on) => changeTextView({ highlightSyntax: on }),
    },
    { language: picked, keep: (language) => pickLanguage(key, language) },
  );
  const trigger = useRef<HTMLButtonElement>(null);
  useBinding(gitKeymap.language, () => trigger.current?.click());
  const shown = comparing === undefined ? path : compared;
  return (
    <LanguageButton
      choice={choice}
      detected={shown && languageOf(shown)}
      single={key !== undefined}
      choose={choose}
      trigger={trigger}
    />
  );
}

export function DiffOptions({ language }: { language: React.ReactNode }) {
  const entire = useGit((state) => state.showEntireFile);
  const ignoreWhitespace = useGit((state) => state.ignoreWhitespace);
  const layout = useGit((state) => state.diffLayout);
  const wordWrap = useShell((state) => state.textView.wordWrap);
  const showWhitespace = useShell((state) => state.textView.showWhitespace);
  const {
    changeShowEntireFile: onEntire,
    changeIgnoreWhitespace: onIgnoreWhitespace,
    changeDiffLayout: onLayout,
  } = useGitActions();
  const { changeTextView } = useShellActions();
  const onShowWhitespace = (show: boolean) =>
    changeTextView({ showWhitespace: show });
  const onWordWrap = (wrap: boolean) => changeTextView({ wordWrap: wrap });
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
