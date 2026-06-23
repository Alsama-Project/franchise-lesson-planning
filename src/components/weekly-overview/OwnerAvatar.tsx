import { avatarColors } from '@/components/weekly-overview/avatar';
import type { PlanOwner } from '@/types/weekly-overview';

/**
 * The small circular initials avatar shown on a plan card — "whose plan" this is
 * in the shared space. Colour is stable per owner (see avatar.ts).
 */
export function OwnerAvatar({ owner, size = 20 }: { owner: PlanOwner; size?: number }) {
  const { bg, fg } = avatarColors(owner.id);
  return (
    <span
      title={owner.name}
      aria-label={owner.name}
      className="inline-flex flex-shrink-0 items-center justify-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
        fontSize: size <= 20 ? 8.5 : 9,
      }}
    >
      {owner.initials}
    </span>
  );
}
