import { createContext, useState } from 'react';
import { strings } from '../shared/strings';
import type { ContextMenuItem } from './contextMenu';
import { languages } from './languages';
import { MenuButton } from './menu';
import { useTextView } from './textView';

export type LanguageChoice = 'auto' | 'plain' | (string & {});

export const ChosenLanguage = createContext<string | undefined>(undefined);

export function shownLanguage(
  choice: LanguageChoice,
  detected: string | undefined,
): string | undefined {
  return choice === 'auto' ? detected : choice === 'plain' ? undefined : choice;
}

const languageOfId = (id: string | undefined) =>
  languages.find((language) => language.id === id);

export function languageButtonLabel(
  choice: LanguageChoice,
  detected: string | undefined,
  single: boolean,
): string {
  const { auto, plainText } = strings.common;
  if (!single) {
    return choice === 'plain' ? plainText : auto;
  }
  return languageOfId(shownLanguage(choice, detected))?.name ?? plainText;
}

export function languageMenu(
  choice: LanguageChoice,
  detected: string | undefined,
  single: boolean,
  choose: (choice: LanguageChoice) => void,
): ContextMenuItem[] {
  const { auto, autoChoice, plainText } = strings.common;
  const named = single && choice === 'auto';
  const modes: ContextMenuItem[] = [
    {
      label: named
        ? autoChoice(languageOfId(detected)?.name ?? plainText)
        : auto,
      keywords: named ? languageOfId(detected)?.keywords : undefined,
      checked: choice === 'auto',
      onClick: () => choose('auto'),
    },
    {
      label: plainText,
      checked: choice === 'plain',
      onClick: () => choose('plain'),
    },
  ];
  return single
    ? [
        ...modes,
        { separator: true },
        ...languages.map(({ id, name, keywords }) => ({
          label: name,
          keywords,
          checked: choice === id,
          onClick: () => choose(id),
        })),
      ]
    : modes;
}

export function useLanguageChoice(file: string | undefined): {
  readonly choice: LanguageChoice;
  readonly choose: (choice: LanguageChoice) => void;
} {
  const textView = useTextView();
  const [picked, setPicked] = useState<{
    readonly file: string;
    readonly language: string;
  }>();
  if (picked !== undefined && picked.file !== file) {
    setPicked(undefined);
  }
  const language = picked?.file === file ? picked?.language : undefined;
  const choice = language ?? (textView.view.highlightSyntax ? 'auto' : 'plain');
  const choose = (chosen: LanguageChoice) => {
    if (chosen === 'auto' || chosen === 'plain') {
      setPicked(undefined);
      textView.change({
        ...textView.view,
        highlightSyntax: chosen === 'auto',
      });
    } else if (file !== undefined) {
      setPicked({ file, language: chosen });
    }
  };
  return { choice, choose };
}

export function LanguageButton({
  choice,
  detected,
  single,
  choose,
  trigger,
}: {
  choice: LanguageChoice;
  detected: string | undefined;
  single: boolean;
  choose: (choice: LanguageChoice) => void;
  trigger?: React.Ref<HTMLButtonElement>;
}) {
  const { language, findLanguage } = strings.common;
  return (
    <div className="language-button">
      <MenuButton
        title={language}
        trigger={trigger}
        label={languageButtonLabel(choice, detected, single)}
        filter={single ? findLanguage : undefined}
        items={languageMenu(choice, detected, single, choose)}
      />
    </div>
  );
}
