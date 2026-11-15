import { plainPng } from './imageSamples.mts';
import type { PlanBuilder, PlanOptions } from './filesPlan.mts';

export function planThumbnails(
  builder: PlanBuilder,
  options: PlanOptions,
): void {
  const { file, section } = builder;
  const { large } = options;
  section(
    'thumbnails',
    `${large ? 2000 : 200} images of many sizes and colors, to scroll in thumbnails with Mod+2.`,
  );
  for (let i = 0; i < (large ? 2000 : 200); i++) {
    file(`thumbnails/image-${String(i + 1).padStart(4, '0')}.png`, () =>
      plainPng(48 + ((i * 37) % 400), 48 + ((i * 53) % 300), (i * 47) % 360),
    );
  }
}
