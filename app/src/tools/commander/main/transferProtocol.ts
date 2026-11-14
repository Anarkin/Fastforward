import type { Sentence } from '../../../lib/shared/strings';
import type { Clash, TransferProgress } from '../shared/transfers';
import type { ClashReply, TransferPlan } from './transfer';

export type TransferCommand =
  | { readonly type: 'start'; readonly plan: TransferPlan }
  | { readonly type: 'answer'; readonly reply: ClashReply }
  | { readonly type: 'stop' };

export type TransferEvent =
  | { readonly type: 'progress'; readonly progress: TransferProgress }
  | { readonly type: 'clash'; readonly clash: Clash }
  | {
      readonly type: 'failed';
      readonly name: string;
      readonly reason: Sentence;
    }
  | { readonly type: 'warned'; readonly reason: Sentence }
  | {
      readonly type: 'done';
      readonly stopped: boolean;
      readonly error?: string;
    };
