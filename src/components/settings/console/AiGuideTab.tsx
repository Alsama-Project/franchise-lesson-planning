'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ResourceGuideVersion } from '@/lib/console';
import { ErrorText, GhostButton, SectionCard } from './ui';

function formatUploaded(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown date';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Admin "AI resource guide" sub-section. Shows the active guide version (when /
 * by whom), an upload control (.md / .txt read verbatim, or .docx converted to
 * markdown), and a read-only preview of the current guide text. Upload-only —
 * there is no inline editing. Each upload
 * POSTs a new immutable version to `/api/ai-resource-guide`, then refreshes.
 *
 * When no version exists, the generator uses a built-in default guide; the UI
 * says so and the preview is omitted.
 */
export function AiGuideTab({ active }: { active: ResourceGuideVersion | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(file: File) {
    setError(null);
    setMessage(null);
    const fd = new FormData();
    fd.set('file', file);
    startTransition(async () => {
      try {
        const res = await fetch('/api/ai-resource-guide', { method: 'POST', body: fd });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(data?.error ?? 'Upload failed. Please try again.');
          return;
        }
        setMessage('New guide version saved. It is now active for all resource generation.');
        router.refresh();
      } catch {
        setError('Upload failed. Please try again.');
      }
    });
  }

  return (
    <SectionCard
      title="AI resource guide"
      action={
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".md,.txt,.docx,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
          <GhostButton tone="teal" disabled={pending} onClick={() => fileRef.current?.click()}>
            {pending ? 'Uploading…' : 'Upload'}
          </GhostButton>
        </div>
      }
    >
      <div className="px-[18px] py-[16px]">
        <div>
          {active ? (
            <p className="text-[12.5px] text-[#A79E94]">
              Active version uploaded {formatUploaded(active.createdAt)}
              {active.uploadedByName ? ` by ${active.uploadedByName}` : ''}.
            </p>
          ) : (
            <p className="text-[12.5px] text-[#A79E94]">
              No guide uploaded — using the built-in default.
            </p>
          )}
        </div>

        {message ? (
          <p className="mt-[10px] text-[12.5px] font-medium text-[#186155]">{message}</p>
        ) : null}
        <ErrorText>{error}</ErrorText>
      </div>

      {active ? (
        <div className="border-t border-[#F0EAE1] px-[18px] py-[16px]">
          <div className="mb-[8px] text-[11px] font-bold uppercase tracking-[0.05em] text-[#A79E94]">
            Current guide (read-only)
          </div>
          <pre className="max-h-[440px] overflow-auto whitespace-pre-wrap rounded-[10px] border border-[#F0EAE1] bg-[#FBF8F3] p-[14px] font-mono text-[12px] leading-[1.55] text-[#2A2422]">
            {active.content}
          </pre>
        </div>
      ) : null}
    </SectionCard>
  );
}
