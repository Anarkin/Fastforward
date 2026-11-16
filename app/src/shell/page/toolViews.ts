import type { ToHost } from '../shared/protocol';

export interface ToolViews {
  readonly of: (tab: string) => string | undefined;
  readonly keep: (tab: string, view: string) => void;
  readonly onRelease: (
    release: (tab: string) => string | undefined,
  ) => () => void;
}

export const noViews: ToolViews = {
  of: () => undefined,
  keep: () => undefined,
  onRelease: () => () => undefined,
};

export interface PageViews {
  readonly views: ToolViews;
  readonly handed: (tab: string, view: string) => void;
  readonly release: (tab: string) => void;
  readonly held: (tabs: readonly string[]) => void;
}

export function pageViews(post: (message: ToHost) => void): PageViews {
  const views = new Map<string, string>();
  const releases = new Set<(tab: string) => string | undefined>();
  return {
    views: {
      of: (tab) => views.get(tab),
      keep: (tab, view) => {
        views.set(tab, view);
        post({ type: 'keepView', tab, view });
      },
      onRelease: (release) => {
        releases.add(release);
        return () => {
          releases.delete(release);
        };
      },
    },
    handed: (tab, view) => {
      views.set(tab, view);
    },
    release: (tab) => {
      let view: string | undefined;
      for (const release of releases) {
        const released = release(tab);
        view ??= released;
      }
      post({ type: 'released', tab, view: view ?? views.get(tab) ?? '' });
      views.delete(tab);
    },
    held: (tabs) => {
      for (const tab of views.keys()) {
        if (!tabs.includes(tab)) {
          views.delete(tab);
        }
      }
    },
  };
}
