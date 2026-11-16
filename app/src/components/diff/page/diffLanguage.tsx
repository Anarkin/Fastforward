import { useRef } from 'react';
import { languageChoiceOf } from '../../../lib/page/languageMenu';
import { LanguageButton } from '../../../lib/page/languageChoice';
import { languageOf } from '../../../lib/page/languages';
import { useBinding } from '../../../lib/page/shortcuts';
import { diffKeymap } from './diffKeymap';
import type { ScrollSettings } from '../../../lib/page/scrollSettings';

export function DiffLanguage({
  languageKey,
  shown,
  picked,
  onPick,
  highlightSyntax,
  onHighlightSyntax,
  scrolling,
}: {
  readonly languageKey: string | undefined;
  readonly shown: string | undefined;
  readonly picked: string | undefined;
  readonly onPick: (language: string | undefined) => void;
  readonly highlightSyntax: boolean;
  readonly onHighlightSyntax: (on: boolean) => void;
  readonly scrolling: ScrollSettings;
}) {
  const { choice, choose } = languageChoiceOf(
    languageKey,
    { on: highlightSyntax, change: onHighlightSyntax },
    { language: picked, keep: onPick },
  );
  const trigger = useRef<HTMLButtonElement>(null);
  useBinding(diffKeymap.language, () => trigger.current?.click());
  return (
    <LanguageButton
      choice={choice}
      detected={shown && languageOf(shown)}
      single={languageKey !== undefined}
      choose={choose}
      trigger={trigger}
      scrolling={scrolling}
    />
  );
}
