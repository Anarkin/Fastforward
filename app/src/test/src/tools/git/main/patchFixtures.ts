export function section(path: string, lines: number, oldPath = path): string {
  return [
    `diff --git a/${oldPath} b/${path}`,
    'index 1111111..2222222 100644',
    `--- a/${oldPath}`,
    `+++ b/${path}`,
    `@@ -1,${lines} +1,${lines} @@`,
    ' context',
    ...Array.from({ length: lines }, (_, index) =>
      index % 2 ? `+--- added ${index}` : `-+++ removed ${index}`,
    ),
    '\\ No newline at end of file',
    '',
  ].join('\n');
}
