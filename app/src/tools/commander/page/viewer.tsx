import { useCallback, useRef, useState } from 'react';
import type {
  CommanderToHost,
  CommanderToWebviewOf,
  TextEncoding,
} from '../shared/protocol';
import { viewerKeymap, type ViewMode } from '../shared/keymap';
import { pressed } from '../../../shell/shared/keymap';
import { strings } from '../../../shared/strings';
import { HexIcon, PreviewIcon, TextIcon } from '../../../ui/icons';
import { MenuButton } from '../../../ui/menu';
import { TextBody } from './textBody';
import { ByteBody } from './hexBody';
import { PreviewBody } from './previewBody';
import { firstMode, previewOf } from './previews';
import {
  encodingChoices,
  shownEncoding,
  type EncodingChoice,
} from './encodings';

export interface Viewing {
  readonly tab: string;
  readonly size: number | undefined;
  readonly binary?: boolean;
  readonly detected?: TextEncoding;
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
  const [encoding, setEncoding] = useState<EncodingChoice>('auto');
  const place = useRef(0);
  const onPlace = useCallback((byte: number) => {
    place.current = byte;
  }, []);
  const encodingTrigger = useRef<HTMLButtonElement>(null);
  const preview = previewOf(file);
  const shownModes = modes.filter(
    (each) => each.mode !== 'preview' || preview !== undefined,
  );
  const mode =
    chosen ??
    firstMode(file, viewing?.binary === true && viewing.detected === undefined);
  const shown = shownEncoding(encoding, viewing);
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
          return;
        }
        if (
          mode === 'text' &&
          pressed(viewerKeymap.encoding, event, false) !== undefined
        ) {
          event.preventDefault();
          encodingTrigger.current?.click();
        }
      }}
    >
      <header className="column-title">
        <span className="column-name">{file}</span>
        <div className="column-actions">
          {mode === 'text' && (
            <div className="viewer-encoding">
              <MenuButton
                title={strings.commander.encoding}
                trigger={encodingTrigger}
                icon={
                  <span className="viewer-encoding-label">
                    {strings.commander.encodingShort[shown]}
                  </span>
                }
                items={encodingChoices.map((choice) => ({
                  label: strings.commander.encodings[choice],
                  checked: choice === encoding,
                  onClick: () => setEncoding(choice),
                }))}
              />
            </div>
          )}
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
      ) : mode === 'hex' || shown === 'bytes' ? (
        <ByteBody
          layout={mode === 'hex' ? 'hex' : 'text'}
          viewing={viewing}
          place={place}
          onPlace={onPlace}
          post={post}
          listen={listen}
        />
      ) : (
        <TextBody
          key={shown}
          file={file}
          encoding={shown}
          viewing={viewing}
          place={place}
          onPlace={onPlace}
          post={post}
          listen={listen}
        />
      )}
    </section>
  );
}
