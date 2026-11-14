import { renderToStaticMarkup as markupOf } from 'react-dom/server';
import { CommitHistory } from '../../../../../tools/git/page/commitHistory';
import { withStores } from '../../../../helpers/componentFixtures';
import { commitInfo, noModifiers } from '../../../../helpers/fixtures';

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
