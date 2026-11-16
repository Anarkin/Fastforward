import { ImagePane } from '../../../lib/page/images';
import { type Pane } from './imagePanes';

export function ImageDiff({ panes }: { panes: readonly Pane[] }) {
  return (
    <div className="image-diff">
      {panes.map(({ side, url }) =>
        url === undefined ? (
          <div key={side} className="image-pane filler">
            <div className="image-frame" />
          </div>
        ) : (
          <ImagePane key={url} url={url} />
        ),
      )}
    </div>
  );
}
