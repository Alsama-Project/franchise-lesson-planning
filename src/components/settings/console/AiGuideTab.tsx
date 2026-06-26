'use client';

import type { ResourceGuideVersion } from '@/lib/console';
import { GuideUploadCard } from './GuideUploadCard';

/**
 * Admin "AI resource guide" sub-section. The admin uploads the best-practice text
 * that steers the resource generator (Aya); each upload POSTs a new immutable
 * version to `/api/ai-resource-guide` (.md / .txt verbatim, or .docx converted to
 * markdown), then refreshes. Upload-only — no inline editing.
 *
 * Presentation is the shared {@link GuideUploadCard}, consistent with the SMARTT
 * guide and the curriculum upload. It shows the active version's filename + upload
 * date (no text preview); when none exists the generator uses a built-in default.
 */
export function AiGuideTab({ active }: { active: ResourceGuideVersion | null }) {
  return (
    <GuideUploadCard
      title="AI resource guide"
      endpoint="/api/ai-resource-guide"
      active={active}
      successMessage="New guide version saved. It is now active for all resource generation."
      uploadingLabel="Uploading resource guide"
    />
  );
}
