import type { ProgressData, ProgressStorage } from '@voiceguide/core';

const KEY = 'voiceguide.progress.v1';

/** Learning progress lives on-device in localStorage — nothing is uploaded. */
export class LocalStorageProgressStorage implements ProgressStorage {
  load(): ProgressData {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw) as ProgressData;
    } catch {
      /* corrupted storage → start fresh */
    }
    return { tools: {} };
  }

  save(data: ProgressData): void {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  }
}
