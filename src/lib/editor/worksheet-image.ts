'use client';

// Upload an in-memory image (a copied bank image, or a PDF page rendered to PNG)
// into the worksheet's own storage and return a long-lived URL for an inline
// image node. Reuses the same Server Action the editor's "Insert image" path
// uses, so the copied bytes live under the teacher's worksheet prefix and are
// fully independent of the source bank resource.

import { uploadWorksheetImageAction } from '@/lib/actions/worksheet';

/** Upload an image Blob and return its embeddable URL, or null on failure. */
export async function uploadWorksheetImageBlob(
  blob: Blob,
  fileName: string,
): Promise<string | null> {
  const type = blob.type || 'image/png';
  const fd = new FormData();
  fd.append('file', new File([blob], fileName, { type }));
  const res = await uploadWorksheetImageAction(fd);
  return res.ok && res.url ? res.url : null;
}
