import { useEffect } from 'react';
import { useShell, useShellActions } from '../../../shell/page/store';
import { languageKeyOf, pickedFor } from './gitSelectors';
import { useGit, useGitActions } from './store';
import { DiffLanguage as LanguagePick } from '../../../lib/page/diffLanguage';
import { DiffToggles } from '../../../lib/page/diffToggles';

export function DiffLanguage() {
  const key = useGit((state) => languageKeyOf(state.tab));
  const path = useGit((state) => state.tab.path);
  const picked = useGit(pickedFor(key));
  const highlightSyntax = useShell((state) => state.textView.highlightSyntax);
  const scrolling = useShell((state) => state.scrolling);
  const { changeTextView } = useShellActions();
  const { pickLanguage, seeLanguageKey } = useGitActions();
  useEffect(() => seeLanguageKey(key), [key, seeLanguageKey]);
  return (
    <LanguagePick
      languageKey={key}
      shown={path}
      picked={picked}
      onPick={(language) => pickLanguage(key, language)}
      highlightSyntax={highlightSyntax}
      onHighlightSyntax={(on) => changeTextView({ highlightSyntax: on })}
      scrolling={scrolling}
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
    <DiffToggles
      language={language}
      entire={entire}
      ignoreWhitespace={ignoreWhitespace}
      layout={layout}
      wordWrap={wordWrap}
      showWhitespace={showWhitespace}
      onEntire={onEntire}
      onIgnoreWhitespace={onIgnoreWhitespace}
      onLayout={onLayout}
      onWordWrap={onWordWrap}
      onShowWhitespace={onShowWhitespace}
    />
  );
}
