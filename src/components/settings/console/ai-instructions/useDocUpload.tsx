'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

// Shared upload transition for the "Add document" and "Replace" flows. Mirrors
// GuideUploadCard's mechanism (fetch multipart → read {error} → router.refresh),
// so both surfaces share one implementation and the reused curriculum progress /
// error primitives render the same way. The mockup draws neither progress nor
// failure; this fills that gap without inventing a look.

export interface DocUploadState {
  pending: boolean;
  /** Server error text (verbatim) or a translated fallback; null when clear. */
  error: string | null;
  /**
   * POST a file to `url` as multipart/form-data (`file` + any `fields`). On
   * success refreshes the server data and runs `onSuccess`; on failure surfaces
   * the server's message (falling back to a translated generic).
   */
  upload: (url: string, file: File, fields?: Record<string, string>, onSuccess?: () => void) => void;
  clearError: () => void;
}

export function useDocUpload(): DocUploadState {
  const router = useRouter();
  const t = useTranslations('settings');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function upload(
    url: string,
    file: File,
    fields?: Record<string, string>,
    onSuccess?: () => void,
  ) {
    setError(null);
    const fd = new FormData();
    fd.set('file', file);
    if (fields) for (const [k, v] of Object.entries(fields)) fd.set(k, v);

    startTransition(async () => {
      try {
        const res = await fetch(url, { method: 'POST', body: fd });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(data?.error ?? t('aiInstructions.upload.failed'));
          return;
        }
        onSuccess?.();
        router.refresh();
      } catch {
        setError(t('aiInstructions.upload.failed'));
      }
    });
  }

  return { pending, error, upload, clearError: () => setError(null) };
}

/** A hidden `<input type=file>` bound to a picker. Returns the input ref + an
 *  `open()` to trigger it, so callers render their own visible affordance. */
export function useFilePicker(onPick: (file: File) => void) {
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      accept=".md,.txt,.docx,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onPick(f);
        e.target.value = '';
      }}
    />
  );
  return { input, open: () => ref.current?.click() };
}
