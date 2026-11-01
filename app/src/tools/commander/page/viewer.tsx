import { useState } from 'react';
import type { CommanderToHost, CommanderToWebviewOf } from '../shared/protocol';
import { commanderKeymap, type ViewMode } from '../shared/keymap';
import { pressed } from '../../../shell/shared/keymap';
import { strings } from '../../../shared/strings';
import { HexIcon, TextIcon } from '../../../ui/icons';
import { TextBody } from './textBody';
import { HexBody } from './hexBody';

export interface Viewing {
  readonly tab: string;
  readonly size: number | undefined;
  readonly binary?: boolean;
  readonly error?: string;
}

export type ToViewer = CommanderToWebviewOf<'rows' | 'text' | 'bytes'>;

const modes: readonly {
  readonly mode: ViewMode;
  readonly title: string;
  readonly icon: React.ReactNode;
}[] = [
  { mode: 'text', title: strings.commander.viewText, icon: <TextIcon /> },
  { mode: 'hex', title: strings.commander.viewHex, icon: <HexIcon /> },
];

export function Viewer({
  file,
  viewing,
  post,
  listen,
}: {
  file: string;
  viewing: Viewing | undefined;
  post: (message: CommanderToHost) => void;
  listen: (handler: (message: ToViewer) => void) => () => void;
}) {
  const [chosen, setChosen] = useState<ViewMode>();
  const mode = chosen ?? (viewing?.binary === true ? 'hex' : 'text');

  return (
    <section
      className="column viewer"
      onKeyDown={(event) => {
        const wanted = pressed(commanderKeymap.viewAs, event, false);
        if (wanted !== undefined) {
          event.preventDefault();
          setChosen(wanted);
        }
      }}
    >
      <header className="column-title">
        <span className="column-name">{file}</span>
        <div className="column-actions">
          <div
            className="segmented"
            role="group"
            aria-label={strings.commander.viewAs}
          >
            {modes.map(({ mode: each, title, icon }) => (
              <button
                key={each}
                className={`nav-button toggle ${mode === each ? 'active' : ''}`}
                title={title}
                aria-pressed={mode === each}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setChosen(each)}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>
      </header>
      {viewing === undefined ? (
        <div className="column-body viewer-body" />
      ) : mode === 'hex' ? (
        <HexBody viewing={viewing} post={post} listen={listen} />
      ) : (
        <TextBody file={file} viewing={viewing} post={post} listen={listen} />
      )}
    </section>
  );
}
