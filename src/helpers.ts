import type { OutrightRunner, OutrightYesNoRunner, OutrightPriceRunner } from './types.js';

/** True for Make Cut style runners (yes/no prices) rather than Winner/Top N runners (odds/layOdds). */
export function isYesNoRunner(runner: OutrightRunner): runner is OutrightYesNoRunner {
  return !('odds' in runner) && ('yes' in runner || 'no' in runner || 'layYes' in runner || 'layNo' in runner);
}

/** True for Winner and Top N runners (odds, plus layOdds on exchanges). */
export function isPriceRunner(runner: OutrightRunner): runner is OutrightPriceRunner {
  return 'odds' in runner;
}
