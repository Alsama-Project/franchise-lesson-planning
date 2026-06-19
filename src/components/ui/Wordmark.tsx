import { cn } from "@/lib/cn";

type WordmarkProps = {
  /** Visual size. `lg` is the login brand-panel scale; `md`/`sm` the top-bar scale. */
  size?: "sm" | "md" | "lg";
  /** Colour tone. `brand` is pink (on light); `cream` is for dark panels. */
  tone?: "brand" | "cream";
  className?: string;
};

const SIZES: Record<NonNullable<WordmarkProps["size"]>, string> = {
  sm: "text-[30px]",
  md: "text-[40px]",
  lg: "text-[60px]",
};

const TONES: Record<NonNullable<WordmarkProps["tone"]>, string> = {
  brand: "text-pink",
  cream: "text-cream",
};

/**
 * The Alsama wordmark — the ONLY place the Sacramento typeface is used.
 * Decorative, so it's hidden from assistive tech (the surrounding chrome labels
 * the app).
 */
export function Wordmark({
  size = "md",
  tone = "brand",
  className,
}: WordmarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "font-display leading-[0.8] select-none",
        SIZES[size],
        TONES[tone],
        className,
      )}
    >
      Alsama
    </span>
  );
}
