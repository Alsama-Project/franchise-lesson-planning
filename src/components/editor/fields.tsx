import type { SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Small uppercase label above an editor field. */
export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[12px] font-semibold text-neutral-700">{children}</label>
  );
}

const TEXTAREA_BASE =
  'w-full rounded-md border border-border bg-surface-subtle px-3 py-[11px] ' +
  'font-sans text-[13.5px] leading-[1.55] text-neutral-900 ' +
  'placeholder:text-neutral-400 outline-none resize-y ' +
  'focus:border-teal focus:bg-surface';

/** The editor's standard textarea, styled from the design's `.lp` rule. */
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(TEXTAREA_BASE, className)} {...props} />;
}

const SELECT_BASE =
  'appearance-none cursor-pointer rounded-sm border border-status-submitted-border ' +
  'bg-status-submitted-bg py-[6px] ps-[10px] pe-7 font-sans text-[12px] font-semibold ' +
  'text-[#186155] outline-none bg-no-repeat ' +
  // The chevron sits on the inline-end side; flip it to the start in RTL so it
  // tracks the `pe-7` reserve rather than overlapping the text.
  '[background-position:right_8px_center] rtl:[background-position:left_8px_center]';

// The teal chevron, supplied via inline style to avoid escaping a data-URL in a
// Tailwind arbitrary value.
const SELECT_ARROW =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='%231F7A6C' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")";

/** The editor's teal pill select, styled from the design's `select.lp` rule. */
export function Select({ className, children, style, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(SELECT_BASE, className)}
      style={{
        backgroundImage: SELECT_ARROW,
        backgroundSize: '13px 13px',
        ...style,
      }}
      {...props}
    >
      {children}
    </select>
  );
}
