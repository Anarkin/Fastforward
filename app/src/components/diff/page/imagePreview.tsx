import { ImagePane } from '../../../lib/page/images';
import { type Pane } from './imagePanes';
import { stripesFrom } from './codeSnap';

export function ImageDiff({
  panes,
  top,
}: {
  panes: readonly Pane[];
  top: number;
}) {
  return (
    <div className="image-diff">
      {panes.map(({ side, url }) =>
        url === undefined ? (
          <div
            key={side}
            className="image-pane filler"
            style={stripesFrom(top)}
          >
            <div className="image-frame" />
          </div>
        ) : (
          <ImagePane key={url} url={url} />
        ),
      )}
    </div>
  );
}
