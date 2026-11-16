import { useState } from 'react';
import { StatusLine } from './statusLine';
import { useShownAfter } from './shownAfter';
import { strings } from '../shared/strings';

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
  const [said, setSaid] = useState(loading ? undefined : children);
  if (!loading && said !== children) {
    setSaid(children);
  }
  if (loading && reading) {
    return (
      <StatusLine font={font} announced>
        {strings.common.reading}
      </StatusLine>
    );
  }
  const shown = loading ? said : children;
  return shown === undefined ? null : (
    <StatusLine font={font}>{shown}</StatusLine>
  );
}
