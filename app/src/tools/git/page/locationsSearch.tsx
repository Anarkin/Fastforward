import type { RefInfo } from '../shared/protocol';
import { useCheckedOut } from './checkedOut';

export function RefLabel({
  info,
  children,
}: {
  info: RefInfo;
  children: React.ReactNode;
}) {
  const { kind } = info;
  const checkedOut = useCheckedOut(info);
  return (
    <span className={`badge ${kind} ${checkedOut ? 'checked-out' : ''}`}>
      {children}
    </span>
  );
}
