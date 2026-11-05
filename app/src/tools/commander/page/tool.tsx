import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { clicked } from '../../../shell/shared/keymap';
import './style.css';
import { commanderKeymap, viewerKeymap } from '../shared/keymap';
import {
  sides,
  type CommanderToHost,
  type CommanderToWebview,
  type Side,
} from '../shared/protocol';
import { Pane } from './pane';
import { Viewer, type ToViewer, type Viewing } from './viewer';
import { emptyView, reduceView } from './view';
import { nextSort } from './listing';
import { filesToCompare } from './comparing';
import type { ColumnWidths, Layout } from '../shared/settings';
import { columnFocusAttribute } from '../../../ui/columnFocus';
import { followDrag } from '../../../ui/followDrag';
import { useBinding } from '../../../ui/shortcuts';
import { ConfirmPopup } from '../../../shell/page/confirmPopup';
import { deleteQuestion } from './deleting';
import { strings } from '../../../shared/strings';

const minimumShare = 0.15;

export function shareOf(left: number, width: number): number {
  return width <= 0
    ? 0.5
    : Math.min(1 - minimumShare, Math.max(minimumShare, left / width));
}

export function sideToFocus(
  column: Element | undefined,
  focused: Element | null,
): HTMLElement | undefined {
  return column === undefined || column.contains(focused)
    ? undefined
    : (column.querySelector<HTMLElement>(`[${columnFocusAttribute}]`) ??
        undefined);
}

export function CommanderTool({
  active,
  post,
  listen,
  onClose,
}: {
  active: boolean;
  onClose: (tab: string) => void;
  post: (message: CommanderToHost) => void;
  listen: (handler: (message: CommanderToWebview) => void) => () => void;
}) {
  const [view, dispatch] = useReducer(reduceView, emptyView);
  const [drives, setDrives] = useState<readonly string[]>([]);
  const [viewed, setViewed] = useState<Viewing>();
  const viewerListeners = useRef(new Set<(message: ToViewer) => void>());
  const listenViewer = useCallback((handler: (message: ToViewer) => void) => {
    viewerListeners.current.add(handler);
    return () => {
      viewerListeners.current.delete(handler);
    };
  }, []);
  const [deleting, setDeleting] = useState<{
    readonly tab: string;
    readonly side: Side;
    readonly names: readonly string[];
    readonly permanently: boolean;
  }>();
  const [noAccess, setNoAccess] = useState<{
    readonly side: Side;
    readonly folder: string;
    readonly asAdministrator: boolean;
  }>();
  const [share, setShare] = useState(0.5);
  const [resized, setResized] = useState<{
    readonly from: ColumnWidths;
    readonly widths: ColumnWidths;
  }>();
  const columnWidths =
    resized?.from === view.columns ? resized.widths : view.columns;
  const columns = useRef<HTMLDivElement>(null);
  const triggers = {
    left: useRef<HTMLButtonElement>(null),
    right: useRef<HTMLButtonElement>(null),
  };

  useEffect(
    () =>
      listen((message) => {
        if (message.type === 'drives') {
          setDrives(message.drives);
        } else if (message.type === 'viewing') {
          setViewed({
            tab: message.tab,
            size: message.size,
            ...(message.version !== undefined && { version: message.version }),
            ...(message.binary !== undefined && { binary: message.binary }),
            ...(message.hidden !== undefined && { hidden: message.hidden }),
            ...(message.detected !== undefined && {
              detected: message.detected,
            }),
            ...(message.error !== undefined && { error: message.error }),
          });
        } else if (
          message.type === 'rows' ||
          message.type === 'text' ||
          message.type === 'bytes' ||
          message.type === 'found' ||
          message.type === 'pdfPlace'
        ) {
          for (const handler of viewerListeners.current) {
            handler(message);
          }
        } else if (message.type === 'noAccess') {
          setNoAccess({
            side: message.side,
            folder: message.folder,
            asAdministrator: message.asAdministrator,
          });
        } else {
          dispatch(message);
        }
      }),
    [listen],
  );

  const shown = active && view.tab !== undefined;
  const viewing = shown && view.viewing !== undefined;

  useEffect(() => {
    if (!shown || viewing) {
      return;
    }
    sideToFocus(
      columns.current?.children[sides.indexOf(view.active)],
      document.activeElement,
    )?.focus();
  }, [shown, viewing, view.active]);

  useEffect(() => {
    if (view.tab !== undefined) {
      post({ type: 'activate', tab: view.tab, side: view.active });
    }
  }, [post, view.tab, view.active]);

  const stepActive = (step: -1 | 1) => {
    if (view.tab !== undefined) {
      post({ type: 'step', tab: view.tab, side: view.active, step });
    }
  };
  useBinding(commanderKeymap.history, stepActive, shown && !viewing);
  useBinding(
    viewerKeymap.closeViewer,
    () => {
      if (view.tab !== undefined) {
        onClose(view.tab);
      }
    },
    viewing,
  );
  useBinding(
    commanderKeymap.reread,
    () => {
      if (view.tab !== undefined) {
        post({ type: 'reread', tab: view.tab, side: view.active });
      }
    },
    shown && !viewing,
  );
  useEffect(() => {
    const { tab, active: side } = view;
    if (!shown || tab === undefined) {
      return undefined;
    }
    const onMouseUp = (event: MouseEvent) => {
      const step = clicked(commanderKeymap.history, event);
      if (step !== undefined) {
        event.preventDefault();
        post({ type: 'step', tab, side, step });
      }
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [shown, view, post]);

  useBinding(
    commanderKeymap.showHidden,
    () => post({ type: 'showHidden', shown: !view.showHidden }),
    shown && !viewing,
  );
  const chooseLayout = (side: Side, layout: Layout) => {
    dispatch({ type: 'layout', side, layout });
    post({ type: 'layout', side, layout });
  };
  useBinding(
    commanderKeymap.layout,
    (layout) => chooseLayout(view.active, layout),
    shown && !viewing,
  );
  useBinding(
    commanderKeymap.drive,
    (side) => {
      dispatch({ type: 'activate', side });
      triggers[side].current?.click();
    },
    shown && !viewing && drives.length > 0,
  );

  if (!active) {
    return null;
  }
  const { tab } = view;
  const resizer = <Resizer columns={columns} onShare={setShare} />;
  const openIn = (side: Side) => (name: string) => {
    if (tab !== undefined) {
      post({ type: 'open', tab, side, name });
    }
  };

  if (view.viewing !== undefined) {
    return (
      <div className="repository commander">
        <div className="columns viewer-columns">
          <Viewer
            key={view.tab}
            file={view.viewing}
            fileColors={view.fileColors}
            viewing={viewed?.tab === view.tab ? viewed : undefined}
            post={post}
            listen={listenViewer}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="repository commander">
      <div
        className="columns commander-columns"
        ref={columns}
        data-active-side={view.active}
        style={{
          gridTemplateColumns: `minmax(0, ${share}fr) minmax(0, ${1 - share}fr)`,
        }}
      >
        {sides.map((side) => (
          <Pane
            key={side}
            tab={tab}
            side={side}
            active={side === view.active}
            pane={view.panes[side]}
            layout={view.layouts[side]}
            thumbnailSize={view.thumbnailSize}
            fileColors={view.fileColors}
            onLayout={(layout) => chooseLayout(side, layout)}
            onThumbnail={(name, box, pixelRatio, made) => {
              const folder = view.panes[side]?.folder;
              if (tab === undefined || folder === undefined) {
                return;
              }
              void made.arrayBuffer().then((buffer) =>
                post({
                  type: 'saveThumbnail',
                  tab,
                  side,
                  folder,
                  name,
                  box,
                  pixelRatio,
                  bytes: new Uint8Array(buffer),
                }),
              );
            }}
            columns={columnWidths}
            onResize={(column, width) =>
              setResized({
                from: view.columns,
                widths: { ...columnWidths, [column]: width },
              })
            }
            onResized={(column, width) =>
              post({
                type: 'columns',
                columns: { ...view.columns, [column]: width },
              })
            }
            onReset={(column) => {
              post({
                type: 'columns',
                columns: {
                  ...view.columns,
                  [column]: view.defaultColumns[column],
                },
              });
            }}
            drives={drives}
            driveTrigger={triggers[side]}
            onSelect={(key) => dispatch({ type: 'select', side, key })}
            onMark={(keys, marked) =>
              dispatch({ type: 'mark', side, keys, marked })
            }
            onOpen={openIn(side)}
            onSort={(column) => {
              const sort = nextSort(
                view.panes[side]?.sort ?? view.sorts[side],
                column,
              );
              dispatch({ type: 'sort', side, sort });
              post({ type: 'sort', side, sort });
            }}
            onActivate={() => dispatch({ type: 'activate', side })}
            onSwitchSide={() => dispatch({ type: 'switchSide' })}
            onDrive={(drive) => {
              if (tab !== undefined) {
                post({ type: 'drive', tab, side, drive });
              }
            }}
            onDrivesOpening={() => post({ type: 'listDrives' })}
            onCompare={() => {
              const files = filesToCompare(view.active, view.panes);
              if (tab !== undefined && files !== undefined) {
                post({ type: 'compare', tab, files });
              }
            }}
            onView={(name) => {
              if (tab !== undefined) {
                post({ type: 'view', tab, side, name });
              }
            }}
            onDelete={(names, permanently) => {
              if (tab !== undefined) {
                setDeleting({ tab, side, names, permanently });
              }
            }}
            onShellMenu={(names, at, extended) => {
              if (tab !== undefined) {
                post({
                  type: 'shellMenu',
                  tab,
                  side,
                  names,
                  x: at.x,
                  y: at.y,
                  extended,
                });
              }
            }}
            onOpenRepository={(name) => {
              if (tab !== undefined) {
                post({ type: 'openRepository', tab, side, name });
              }
            }}
            onOpenOnSide={(target, name) => {
              if (tab !== undefined) {
                post({
                  type: 'openOnSide',
                  tab,
                  from: side,
                  side: target,
                  name,
                });
              }
            }}
            onStep={(step) => {
              if (tab !== undefined) {
                post({ type: 'step', tab, side, step });
              }
            }}
            resizer={side === 'left' && resizer}
          />
        ))}
      </div>
      {deleting !== undefined && (
        <ConfirmPopup
          {...deleteQuestion(
            deleting.names,
            deleting.permanently,
            document.documentElement.dataset.platform,
          )}
          onConfirm={() => {
            setDeleting(undefined);
            post({ type: 'delete', ...deleting });
          }}
          onCancel={() => setDeleting(undefined)}
        />
      )}
      {noAccess !== undefined && (
        <ConfirmPopup
          title={strings.commander.noAccessTitle}
          message={strings.commander.noAccess(noAccess.folder)}
          confirm={strings.confirm.ok}
          cancel={null}
          onConfirm={() => setNoAccess(undefined)}
          onCancel={() => setNoAccess(undefined)}
          extra={
            view.canElevate && noAccess.asAdministrator && tab !== undefined
              ? {
                  label: strings.commander.asAdministrator,
                  onClick: () => {
                    setNoAccess(undefined);
                    post({ type: 'elevate', tab, side: noAccess.side });
                  },
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function Resizer({
  columns,
  onShare,
}: {
  columns: React.RefObject<HTMLDivElement | null>;
  onShare: (share: number) => void;
}) {
  return (
    <div
      className="resizer"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const box = columns.current?.getBoundingClientRect();
        if (box === undefined) {
          return;
        }
        followDrag(
          window,
          (move: PointerEvent) =>
            onShare(shareOf(move.clientX - box.left, box.width)),
          () => document.body.classList.remove('resizing'),
        );
        document.body.classList.add('resizing');
      }}
      onDoubleClick={() => onShare(0.5)}
    />
  );
}
