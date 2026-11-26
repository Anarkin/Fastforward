import {
  createHighlighterCore,
  type HighlighterCore,
  type LanguageRegistration,
} from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import { bundledLanguagesInfo } from 'shiki/langs';
import { onceMade } from '../../../lib/page/onceMade';
import { forgetCached } from './cache';
import { onigWasm } from './onigWasm';
import { theme } from './engine';

const registered = new Map<string, LanguageRegistration>();
const generations = new Map<string, number>();

export const generationOf = (language: string) =>
  generations.get(language) ?? 0;

function embeddersOf(loaded: ReadonlySet<string>): Set<string> {
  const stale = new Set<string>();
  const embeds = (language: string) =>
    loaded.has(language) || stale.has(language);
  for (let grew = true; grew;) {
    grew = false;
    for (const {
      name,
      embeddedLangs = [],
      embeddedLangsLazy = [],
    } of registered.values()) {
      if (
        !stale.has(name) &&
        !loaded.has(name) &&
        [...embeddedLangs, ...embeddedLangsLazy].some(embeds)
      ) {
        stale.add(name);
        grew = true;
      }
    }
  }
  return stale;
}

const highlighterMade = onceMade(() =>
  createHighlighterCore({
    themes: [theme],
    engine: createOnigurumaEngine(onigWasm()),
  }),
);
export let ready: HighlighterCore | undefined;
export let grammars = 0;

export async function loadLanguages(
  languages: readonly string[],
): Promise<HighlighterCore> {
  const highlighter = await highlighterMade();
  const loaded = highlighter.getLoadedLanguages();
  const added = await Promise.all(
    bundledLanguagesInfo
      .filter(
        (info) => languages.includes(info.id) && !loaded.includes(info.id),
      )
      .map((info) => info.import()),
  );
  if (added.length > 0) {
    await highlighter.loadLanguage(...added);
    const registrations = added.flatMap((module) => module.default);
    for (const registration of registrations) {
      registered.set(registration.name, registration);
    }
    const stale = embeddersOf(new Set(registrations.map(({ name }) => name)));
    for (const language of stale) {
      generations.set(language, generationOf(language) + 1);
    }
    forgetCached(stale);
    grammars += 1;
  }
  ready = highlighter;
  return highlighter;
}

export function makeHighlighter(): Promise<HighlighterCore> {
  return loadLanguages([]);
}
