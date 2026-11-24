import { pooledBytes } from './unpooledBuffers';
import { UnicodeGraphemesAddon } from '@xterm/addon-unicode-graphemes';

Buffer.poolSize = pooledBytes;

export { UnicodeGraphemesAddon };
