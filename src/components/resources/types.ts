// Shared client-side types for the Resource Bank UI.

import type { Folder, ResourceWithTags, TagsByDimension } from '@/types/resource';

export type Role = 'teacher' | 'coordinator';

/** Which result set the grid is showing. */
export type ActiveView =
  | { kind: 'browse' }
  | { kind: 'most-used' }
  | { kind: 'folder'; id: string };

/** Everything the server hands the client component on first render. */
export interface ResourceBankProps {
  role: Role;
  currentUserId: string;
  subjects: { id: string; name: string }[];
  defaultSubjectId: string | null;
  vocabulary: TagsByDimension;
  initialResources: ResourceWithTags[];
  initialFolders: Folder[];
}
