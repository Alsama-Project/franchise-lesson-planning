import { cn } from "@/lib/cn";

type LogoProps = {
  /** Visual size, set by height. `lg` is the login brand-panel scale; `sm` the top-bar scale. */
  size?: "sm" | "md" | "lg";
  /**
   * Which artwork to use, chosen by the background it sits on:
   * - `dark` (default) — the black logo, for light chrome (top bar, onboarding).
   * - `light` — the white logo, for saturated/dark panels (the login brand panel).
   */
  tone?: "dark" | "light";
  className?: string;
};

// Height only; width is auto so the logo keeps its aspect ratio (no squashing).
const SIZES: Record<NonNullable<LogoProps["size"]>, string> = {
  sm: "h-7", // 28px — top bar
  md: "h-9", // 36px
  lg: "h-16", // 64px — login brand panel
};

const SRC: Record<NonNullable<LogoProps["tone"]>, string> = {
  dark: "/brand/alsama-logo.svg",
  light: "/brand/alsama-logo-cream.svg",
};

/**
 * The Alsama brand logo. Replaces the former text wordmark; it is an image, so it
 * is never mirrored under RTL (the header/login use logical properties, not
 * transforms, so nothing flips it).
 */
export function Logo({ size = "sm", tone = "dark", className }: LogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand asset; next/image adds no value for a tiny inline SVG/PNG
    <img
      src={SRC[tone]}
      alt="Alsama"
      className={cn("w-auto select-none", SIZES[size], className)}
    />
  );
}
