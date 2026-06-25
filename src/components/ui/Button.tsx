import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/Spinner";

type Variant = "primary" | "secondary" | "brand";
type Size = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** While true the button lightens, shows an inline spinner, and is disabled. */
  pending?: boolean;
};

const BASE =
  "inline-flex items-center justify-center gap-[11px] font-semibold cursor-pointer " +
  "transition-colors disabled:cursor-not-allowed disabled:opacity-60 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 focus-visible:ring-offset-2";

const VARIANTS: Record<Variant, string> = {
  // Teal CTA — the in-app "actions" colour (teal = actions).
  primary: "bg-teal text-white border border-teal hover:bg-[#1a6a5d]",
  // Brand-pink CTA — the login "Sign in with Microsoft" action.
  brand: "bg-pink text-white border border-pink hover:bg-[#9e2450]",
  // White surface with a warm border — the shell's quieter actions.
  secondary:
    "bg-surface text-ink border border-border-strong hover:bg-surface-subtle",
};

const SIZES: Record<Size, string> = {
  sm: "text-[13px] px-[13px] py-[7px] rounded-sm",
  md: "text-[15px] px-[15px] py-[15px] rounded-md",
};

/**
 * The single Button primitive for this slice. Variants and sizes mirror what the
 * Login and shell designs use; the set grows per page later. Passing `pending`
 * gives consistent in-flight feedback: the fill lightens and an inline spinner
 * appears, and the button is disabled so the action can't be re-fired.
 */
export function Button({
  variant = "primary",
  size = "md",
  pending = false,
  className,
  type = "button",
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={cn(
        BASE,
        VARIANTS[variant],
        SIZES[size],
        // Pending lightens the fill without dropping below the disabled floor.
        pending && "opacity-80",
        className,
      )}
      {...props}
    >
      {pending ? <Spinner /> : null}
      {children}
    </button>
  );
}
