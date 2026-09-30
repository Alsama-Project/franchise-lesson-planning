// A debounced autosave that never silently drops an edit.
//
//  • schedule(payload) — remember the latest payload and save it after a pause.
//  • flush()           — save the latest payload now (the editor calls this when it
//                        unmounts, so leaving the page doesn't lose the last edit).
//  • hasPending()      — true while an edit is unsaved (drives the leave-page warning).
//  • cancel()          — drop the unsaved edit (Submit / Save persist the same fields).
//  • A failed or thrown save keeps the payload and retries on its own with back-off,
//    reporting 'retrying' until a save succeeds. A newer edit replaces the failed one.
//
// Framework-free so it is unit-tested directly (src/lib/editor/__tests__/autosave.test.ts).

export type AutosaveState = 'saving' | 'saved' | 'retrying';

type TimerId = ReturnType<typeof setTimeout> | number;

export interface AutosaveOptions<T> {
  /** Persist one payload. Resolve true when saved, false when the save failed. */
  save: (payload: T) => Promise<boolean>;
  /** Pause after the last edit before saving. */
  delayMs: number;
  /** Waits between retries; the last value repeats until a save succeeds. */
  retryDelaysMs?: number[];
  onState: (state: AutosaveState) => void;
  /** Injected for tests; defaults to the global timers. */
  timers?: { set: (fn: () => void, ms: number) => TimerId; clear: (id: TimerId) => void };
}

export interface Autosave<T> {
  schedule(payload: T): void;
  flush(): Promise<void>;
  hasPending(): boolean;
  /** Drop the unsaved edit and stop the timer — for when the caller saves the same data itself. */
  cancel(): void;
}

const DEFAULT_RETRY_DELAYS_MS = [2000, 5000, 10000, 30000];

export function createAutosave<T>(opts: AutosaveOptions<T>): Autosave<T> {
  const retryDelays = opts.retryDelaysMs?.length ? opts.retryDelaysMs : DEFAULT_RETRY_DELAYS_MS;
  const timers = opts.timers ?? {
    set: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clear: (id: TimerId) => clearTimeout(id as ReturnType<typeof setTimeout>),
  };

  let pending: { payload: T } | null = null;
  let inFlight = false;
  let timer: TimerId | null = null;
  let failures = 0;

  function clearTimer() {
    if (timer !== null) {
      timers.clear(timer);
      timer = null;
    }
  }

  function wait(ms: number) {
    clearTimer();
    timer = timers.set(() => {
      timer = null;
      void flush();
    }, ms);
  }

  async function flush(): Promise<void> {
    clearTimer();
    if (!pending || inFlight) return;
    const current = pending;
    pending = null;
    inFlight = true;
    opts.onState('saving');
    let ok = false;
    try {
      ok = await opts.save(current.payload);
    } catch {
      ok = false;
    }
    inFlight = false;

    if (ok) {
      failures = 0;
      if (pending) wait(opts.delayMs);  // an edit arrived mid-save: save it next
      else opts.onState('saved');
      return;
    }
    // Keep the failed payload unless a newer edit has already replaced it, then retry.
    if (!pending) pending = current;
    opts.onState('retrying');
    wait(retryDelays[Math.min(failures, retryDelays.length - 1)]);
    failures += 1;
  }

  return {
    schedule(payload: T) {
      pending = { payload };
      if (inFlight) return; // flush() picks it up when the current save finishes
      opts.onState('saving');
      wait(opts.delayMs);
    },
    flush,
    hasPending: () => pending !== null || inFlight,
    cancel() {
      clearTimer();
      pending = null;
      failures = 0;
    },
  };
}
