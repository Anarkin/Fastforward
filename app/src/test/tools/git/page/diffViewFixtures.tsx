import { diffRows } from '../../../../tools/git/page/diffRows';

export function patch(path: string, added: number): string {
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -0,0 +1,${added} @@`,
    ...Array.from({ length: added }, (_, index) => `+line ${index}`),
  ].join('\n');
}

export const kinds = (rows: ReturnType<typeof diffRows>) =>
  rows.map((row) => row.kind);
