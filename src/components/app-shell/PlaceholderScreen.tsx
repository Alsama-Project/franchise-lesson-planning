import type { ReactNode } from 'react';

/**
 * A flat "not built yet" screen body for routes that exist in the nav but aren't
 * designed in this pass (Curriculum, and the full Resource Bank). Keeps the shell
 * and active nav states working while the real screen lands later.
 */
export function PlaceholderScreen({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h1 className="text-[25px] font-semibold tracking-[-0.01em]">{title}</h1>
      <div className="mt-6 rounded-[14px] border border-border px-6 py-16 text-center">
        <p className="mx-auto max-w-[460px] text-[13.5px] text-text-muted">{children}</p>
      </div>
    </div>
  );
}
