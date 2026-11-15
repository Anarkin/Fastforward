import { renderToStaticMarkup as markupOf } from 'react-dom/server';
import type { JSDOM } from 'jsdom';
import { CommitHistory } from '../../../../../tools/git/page/commitHistory';
import { withStores } from '../../../../helpers/componentFixtures';
import { commitInfo } from '../../../../helpers/gitValues';
import { noModifiers } from '../../../../helpers/keys';

export const renderToStaticMarkup = (node: React.ReactNode) =>
  markupOf(withStores(node));

export const noop = () => {};

export const plainClick = { button: 0, ...noModifiers };

export const loaded = (...hashes: string[]) => {
  const history = new CommitHistory(hashes.length);
  history.add(
    0,
    hashes.map((hash) => commitInfo(hash)),
  );
  return history;
};

export const unchangingMedia =
  (window: JSDOM['window']) => (): MediaQueryList =>
    Object.assign(new window.EventTarget(), {
      matches: false,
      media: '',
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
    });
