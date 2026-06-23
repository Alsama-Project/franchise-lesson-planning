// Small helpers for the "whose plan" owner avatar on lesson cards. The colours
// are the design's three avatar tints (pink / teal / amber), assigned stably per
// owner id so the same person keeps the same colour across the grid.

const PALETTE: { bg: string; fg: string }[] = [
  { bg: '#FBEFF3', fg: '#B62A5C' }, // pink
  { bg: '#E4F0ED', fg: '#186155' }, // teal
  { bg: '#F6ECDA', fg: '#B0651E' }, // amber
];

/** Up to two uppercase initials from a display name (falls back to "?"). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** A stable {bg, fg} colour pair for an owner id. */
export function avatarColors(id: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
