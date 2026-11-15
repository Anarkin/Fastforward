import { StatusLine } from '../../../lib/page/statusLine';
import { useShownAfter } from '../../../lib/page/shownAfter';
import { strings } from '../../../lib/shared/strings';

export function ColumnStatus({
  loading,
  font,
  children,
}: {
  loading: boolean;
  font: 'monospace' | 'proportional';
  children: string | undefined;
}) {
  const reading = useShownAfter(loading);
  if (loading) {
    return reading ? (
      <StatusLine font={font} announced>
        {strings.common.reading}
      </StatusLine>
    ) : null;
  }
  return children === undefined ? null : (
    <StatusLine font={font}>{children}</StatusLine>
  );
}
