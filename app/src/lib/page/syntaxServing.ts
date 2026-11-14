import { errorText } from './errors';
import { packedPart, type CodePart } from './syntaxParts';
import {
  SyntaxRange,
  SyntaxSource,
  generationOf,
  colorCode,
  startColoring,
} from './syntaxEngine';
import { EditedColoring, colorEdited } from './editedColors';

export type ToSyntax =
  | {
      readonly type: 'color';
      readonly job: number;
      readonly sources: readonly SyntaxSource[];
      readonly background?: true;
    }
  | { readonly type: 'stop'; readonly job: number }
  | {
      readonly type: 'code';
      readonly job: number;
      readonly language: string;
      readonly code: string;
    }
  | {
      readonly type: 'openLines';
      readonly job: number;
      readonly language: string;
      readonly lines: readonly string[];
    }
  | {
      readonly type: 'editLines';
      readonly job: number;
      readonly from: number;
      readonly removed: number;
      readonly lines: readonly string[];
    };

export type FromSyntax =
  | {
      readonly type: 'colors';
      readonly job: number;
      readonly generations: Readonly<Record<string, number>>;
      readonly ranges: readonly (readonly [string, readonly SyntaxRange[]])[];
    }
  | {
      readonly type: 'entire';
      readonly job: number;
      readonly generation: number;
      readonly source: number;
      readonly part: CodePart;
    }
  | {
      readonly type: 'code';
      readonly job: number;
      readonly part: CodePart | undefined;
    }
  | { readonly type: 'failed'; readonly message: string };

class ChangedRanges extends Map<string, readonly SyntaxRange[]> {
  readonly changed = new Map<string, readonly SyntaxRange[]>();

  override set(key: string, ranges: readonly SyntaxRange[]): this {
    this.changed.set(key, ranges);
    return super.set(key, ranges);
  }
}

export function serveColoring(
  post: (message: FromSyntax) => void,
  later: (run: () => void) => void = (run) => setTimeout(run),
): (message: ToSyntax) => void {
  const jobs = new Map<number, () => void>();
  let foregroundSlices = 0;
  const inForeground = (run: () => void) => {
    foregroundSlices += 1;
    later(() => {
      foregroundSlices -= 1;
      run();
    });
  };
  const inBackground = (run: () => void) =>
    later(() => (foregroundSlices > 0 ? inBackground(run) : run()));
  const edited = new Map<number, EditedColoring>();
  return (message) => {
    const { job } = message;
    if (message.type === 'stop') {
      jobs.get(job)?.();
      jobs.delete(job);
      edited.delete(job);
    } else if (message.type === 'openLines') {
      const session = colorEdited(
        message.language,
        message.lines,
        (part) => post({ type: 'code', job, part }),
        inForeground,
      );
      edited.set(job, session);
      jobs.set(job, () => session.stop());
    } else if (message.type === 'editLines') {
      edited.get(job)?.edit(message.from, message.removed, message.lines);
    } else if (message.type === 'color') {
      const { sources } = message;
      const languages = [...new Set(sources.map(({ language }) => language))];
      const ranges = new ChangedRanges();
      const publish = () => {
        if (ranges.changed.size > 0) {
          post({
            type: 'colors',
            job,
            generations: Object.fromEntries(
              languages.map((language) => [language, generationOf(language)]),
            ),
            ranges: [...ranges.changed],
          });
          ranges.changed.clear();
        }
      };
      jobs.set(
        job,
        startColoring(
          sources,
          ranges,
          publish,
          message.background ? inBackground : inForeground,
          (source, lines) =>
            post({
              type: 'entire',
              job,
              generation: generationOf(sources[source].language),
              source,
              part: packedPart(lines, 0, true),
            }),
        ),
      );
    } else {
      let finished = false;
      const stop = colorCode(
        message.language,
        message.code,
        (part) => {
          if (part === undefined || part.done) {
            finished = true;
            jobs.delete(job);
          }
          post({ type: 'code', job, part });
        },
        inForeground,
      );
      if (!finished) {
        jobs.set(job, stop);
      }
    }
  };
}

export function sendUncaught(
  post: (message: FromSyntax) => void,
): (event: Pick<ErrorEvent, 'error' | 'message' | 'preventDefault'>) => void {
  return (event) => {
    post({ type: 'failed', message: errorText(event.error ?? event.message) });
    event.preventDefault();
  };
}
