import { pdfParts } from './formats.mts';
import { paddedTable } from './paddedTable.mts';
import type { PlanBuilder, PlanOptions } from './filesPlan.mts';
import { mib, oneLineOfSize, logOfSize } from './sizedContents.mts';
import { largePdfPages } from './planContents.mts';

export function planHuge(builder: PlanBuilder, options: PlanOptions): void {
  const { items, file, chunks, section } = builder;
  const { large } = options;
  if (large) {
    section(
      'huge',
      'A log of 200 MiB with one NEEDLE near its end, a padded table of 10 MiB, one line of 50 MiB and a PDF of 100 MiB.',
    );
    chunks('huge/log-of-200-mib.log', 200 * mib, () => logOfSize(200 * mib));
    file('huge/padded-table-of-10-mib.md', () => paddedTable(1, 7985));
    chunks('huge/one-line-of-50-mib.txt', 50 * mib, () =>
      oneLineOfSize(50 * mib),
    );
    items.push({
      kind: 'chunks',
      path: 'huge/pdf-of-100-mib.pdf',
      chunks: () => pdfParts(largePdfPages(2300), 2300),
    });
  }
}
