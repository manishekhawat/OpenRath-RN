/**
 * What OpenRath records when something goes wrong (Crash.java and Diag.java, 1.43): the errors it
 * caught and carried on from, for Settings > Help > Diagnostics, and a crash report for the ones
 * it couldn't. Installed as the app starts, before the screens are up, so a crash while they are
 * still loading is recorded too; the crash notes go to the usage reports' own store, with places
 * and links taken out of the stack, and are read back in Settings > Help > Crash reports.
 *
 * Android's own handler still runs after ours, so the stereo's launcher behaves as it always does.
 */
import * as Diag from '../logic/diag';
import * as Reports from '../logic/reports';
import * as Store from './store';

type Handler = (e: unknown, fatal?: boolean) => void;

interface Utils {
  getGlobalHandler?: () => Handler | undefined;
  setGlobalHandler?: (h: Handler) => void;
}

let installed = false;

/** Note an error; `fatal` means the app can't carry on, so it is kept as a crash report too. */
export function record(e: unknown, fatal: boolean, now = Date.now()): void {
  Diag.note(fatal ? 'crash' : 'caught', e, now);
  if (!fatal) return;
  const stack = e instanceof Error && e.stack ? e.stack : Diag.what(e);
  Reports.crash(Diag.scrub(stack), now);
}

/** Start recording. Safe to call again: the handler is only put in place once. */
export function install(): void {
  if (installed) return;
  installed = true;
  Reports.keepCrashesIn(Store.reports);
  const utils = (globalThis as { ErrorUtils?: Utils }).ErrorUtils;
  if (!utils?.setGlobalHandler) return;
  const before = utils.getGlobalHandler?.();
  utils.setGlobalHandler((e, fatal) => {
    try {
      record(e, fatal !== false);
    } catch {
      // nothing left to tell: recording the error must not take the app down with it
    }
    before?.(e, fatal);
  });
}

install();
