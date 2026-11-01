import { useState } from 'react';
import type { CommanderToHost, CommanderToWebviewOf } from '../shared/protocol';
import { viewerKeymap, type ViewMode } from '../shared/keymap';
import { pressed } from '../../../shell/shared/keymap';
import { strings } from '../../../shared/strings';
import { HexIcon, PreviewIcon, TextIcon } from '../../../ui/icons';
import { TextBody } from './textBody';
import { ByteBody } from './hexBody';
import { PreviewBody } from './previewBody';
import { firstMode, previewOf } from './previews';

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
  {
    mode: 'preview',
    title: strings.commander.viewPreview,
    icon: <PreviewIcon />,
  },
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
  const preview = previewOf(file);
  const shownModes = modes.filter(
    (each) => each.mode !== 'preview' || preview !== undefined,
  );
  const mode = chosen ?? firstMode(file, viewing?.binary === true);
  const choose = (wanted: ViewMode) => {
    if (shownModes.some((each) => each.mode === wanted)) {
      setChosen(wanted);
    }
  };

  return (
    <section
      className="column viewer"
      onKeyDown={(event) => {
        const wanted = pressed(viewerKeymap.viewAs, event, false);
        if (wanted !== undefined) {
          event.preventDefault();
          choose(wanted);
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
            {shownModes.map(({ mode: each, title, icon }) => (
              <button
                key={each}
                className={`nav-button toggle ${mode === each ? 'active' : ''}`}
                title={title}
                aria-pressed={mode === each}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(each)}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>
      </header>
      {viewing === undefined ? (
        <div className="column-body viewer-body" />
      ) : mode === 'preview' && preview !== undefined ? (
        <PreviewBody
          file={file}
          preview={preview}
          viewing={viewing}
          post={post}
          listen={listen}
        />
      ) : mode === 'hex' || viewing.binary === true ? (
        <ByteBody
          layout={mode === 'hex' ? 'hex' : 'text'}
          viewing={viewing}
          post={post}
          listen={listen}
        />
      ) : (
        <TextBody file={file} viewing={viewing} post={post} listen={listen} />
      )}
    </section>
  );
}
