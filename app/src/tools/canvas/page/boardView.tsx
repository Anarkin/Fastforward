import { Words } from '../../../lib/page/name';
import { PathTitle } from '../../../lib/page/pathTitle';
import { boardShown } from './state';
import { useCanvas } from './store';

export function BoardView() {
  const file = useCanvas((state) => state.file);
  const error = useCanvas((state) => boardShown(state)?.error);
  return (
    <section className="column board">
      <div className="path-row">
        {file !== undefined && <PathTitle path={file} file />}
      </div>
      <div className="column-body board-body">
        {error !== undefined && (
          <div className="board-error">
            <Words>{error}</Words>
          </div>
        )}
      </div>
    </section>
  );
}
