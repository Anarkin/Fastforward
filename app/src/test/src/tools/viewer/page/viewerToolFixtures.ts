import type {
  ByteRange,
  TextRow,
  ViewerToHost,
  ViewerToWebview,
} from '../../../../../tools/viewer/shared/protocol';
import {
  inTool,
  type ShownTool,
  type Tool,
} from '../../../../helpers/toolFixtures';

export interface ViewedText {
  readonly rows: readonly TextRow[];
  readonly size: number;
}

export function viewedTextOf(lines: readonly string[]): ViewedText {
  const rows: TextRow[] = [];
  let start = 0;
  for (const text of lines) {
    rows.push({ start, end: start + text.length + 1, text });
    start += text.length + 1;
  }
  return { rows, size: start };
}

function matchesOf(file: ViewedText, query: string): readonly ByteRange[] {
  return file.rows.flatMap((row) => {
    const at = row.text.toLowerCase().indexOf(query.toLowerCase());
    return at === -1
      ? []
      : [{ start: row.start + at, end: row.start + at + query.length }];
  });
}

type ReadRows = Extract<ViewerToHost, { type: 'readRows' }>;

function rowsAnswer(file: ViewedText, ask: ReadRows): ViewerToWebview {
  const start = ask.exact
    ? Math.min(ask.anchor, file.size)
    : (file.rows.find((row) => ask.anchor < row.end)?.start ?? file.size);
  const found = file.rows.findIndex((row) => row.start >= start);
  const index = found === -1 ? file.rows.length : found;
  const earlier = file.rows.slice(Math.max(0, index - ask.before), index);
  const later = file.rows.slice(index, index + ask.after);
  return {
    type: 'rows',
    tab: ask.tab,
    request: ask.request,
    size: file.size,
    rows: [...earlier, ...later],
    anchorIndex: earlier.length,
  };
}

export interface ShownViewer extends ShownTool<'viewer'> {
  readonly answerRows: (file: ViewedText) => Promise<number>;
  readonly answerFinds: (file: ViewedText) => Promise<number>;
  readonly answerBytes: (bytes: readonly number[]) => Promise<number>;
}

export function inViewerTool(
  shownTool: Tool<'viewer'>,
  run: (tool: ShownViewer) => Promise<void>,
): Promise<void> {
  return inTool('viewer', shownTool, (tool) =>
    run({
      ...tool,
      answerRows: async (file) => {
        let count = 0;
        for (
          let ask = tool.asked('readRows')[0];
          ask !== undefined;
          ask = tool.asked('readRows')[0]
        ) {
          tool.answer(ask);
          count += 1;
          await tool.send(rowsAnswer(file, ask));
        }
        return count;
      },
      answerFinds: async (file) => {
        const finds = tool.asked('findText');
        for (const ask of finds) {
          tool.answer(ask);
          await tool.send({
            type: 'found',
            tab: ask.tab,
            request: ask.request,
            matches: matchesOf(file, ask.query),
            capped: false,
            done: true,
          });
        }
        return finds.length;
      },
      answerBytes: async (bytes) => {
        let count = 0;
        for (
          let ask = tool.asked('readBytes')[0];
          ask !== undefined;
          ask = tool.asked('readBytes')[0]
        ) {
          tool.answer(ask);
          count += 1;
          await tool.send({
            type: 'bytes',
            tab: ask.tab,
            request: ask.request,
            start: ask.start,
            data: bytes.slice(ask.start, ask.start + ask.length),
          });
        }
        return count;
      },
    }),
  );
}
