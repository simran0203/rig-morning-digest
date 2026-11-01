import type { Night } from './types.js';

// Plan morning-digest § 1. Reads runs/<night>.jsonl (night = YYYY-MM-DD) into one DigestRow
// per job. Sync, like src/status.ts. See types.ts for the contract.
// Stub until § 1 lands: section 2 can import and type against it now.
export function readNight(runsDir: string, night: string): Night {
  void runsDir;
  void night;
  throw new Error('not implemented');
}
