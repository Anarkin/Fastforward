import { messageOf } from '../../../lib/shared/errors';
import { runTransfer, type ClashReply } from './transfer';
import { runDeletion } from './deletion';
import type { TransferCommand, TransferEvent } from './transferProtocol';

export function transferServer(
  post: (event: TransferEvent) => void,
): (command: TransferCommand) => void {
  let stopped = false;
  let answering: ((reply: ClashReply) => void) | undefined;
  const answer = (reply: ClashReply) => {
    const waiting = answering;
    answering = undefined;
    waiting?.(reply);
  };
  return (command) => {
    switch (command.type) {
      case 'start':
        (command.plan.deletes === true
          ? runDeletion(
              command.plan.sources,
              {
                progress: (progress) => post({ type: 'progress', progress }),
                failed: (name, reason) =>
                  post({ type: 'failed', name, reason }),
              },
              { stopped: () => stopped },
            )
          : runTransfer(
              command.plan,
              {
                progress: (progress) => post({ type: 'progress', progress }),
                clash: (clash) =>
                  new Promise((resolve) => {
                    answering = resolve;
                    post({ type: 'clash', clash });
                  }),
                failed: (name, reason) =>
                  post({ type: 'failed', name, reason }),
              },
              { stopped: () => stopped },
            )
        ).then(
          (end) => post({ type: 'done', stopped: end === 'stopped' }),
          (error: unknown) =>
            post({
              type: 'done',
              stopped: false,
              error: messageOf(error),
            }),
        );
        return;
      case 'answer':
        answer(command.reply);
        return;
      case 'stop':
        stopped = true;
        answer({ answer: 'stop', all: false });
        return;
    }
  };
}
