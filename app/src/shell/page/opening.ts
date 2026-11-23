import { browserOpening } from './openingBrowser';
import { startOpening } from './openingStart';

startOpening(browserOpening(), { location, history });
