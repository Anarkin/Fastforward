import type { PlanBuilder } from './filesPlan.mts';
import {
  c1Utf8,
  c1Windows1252,
  invisibleCatalog,
  invisibleEmoji,
  invisibleProse,
  invisiblesCompared,
  trojanSource,
} from './invisibles.mts';

export function planInvisibles({ file, pairs, section }: PlanBuilder): void {
  section(
    'invisibles',
    'Characters that show nothing, take no room or turn text around: catalog.txt lists every one by its code point, short name and name, between bars, between letters and twice, grouped as C0 and C1 controls, separators, spaces, zero-width and format characters, direction controls, characters that look like nothing, variation selectors, tags and annotations; trojan-source.ts holds direction overrides that make code read otherwise than it runs; prose.txt and emoji.txt where they belong in text, emoji to stay whole; c1-utf8.txt and c1-windows-1252.txt the same bytes in two encodings; compare holds two files that differ by invisible characters alone, to compare with Shift+F3. Show whitespace with `.`.',
  );
  file('invisibles/catalog.txt', invisibleCatalog);
  file('invisibles/trojan-source.ts', trojanSource);
  file('invisibles/prose.txt', invisibleProse);
  file('invisibles/emoji.txt', invisibleEmoji);
  file('invisibles/c1-utf8.txt', c1Utf8);
  file('invisibles/c1-windows-1252.txt', c1Windows1252);
  file('invisibles/compare/old.txt', invisiblesCompared.old);
  file('invisibles/compare/new.txt', invisiblesCompared.new);
  pairs.push(['invisibles/compare/old.txt', 'invisibles/compare/new.txt']);
}
