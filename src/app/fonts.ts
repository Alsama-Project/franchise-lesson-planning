import { IBM_Plex_Sans_Arabic, Sacramento, Sora } from "next/font/google";

/**
 * Brand typefaces, self-hosted via next/font (no runtime request to Google).
 *
 * - Sora is the UI typeface for everything (Latin).
 * - IBM Plex Sans Arabic is the Arabic UI typeface, applied under
 *   `:lang(ar)` / `[dir=rtl]` in globals.css with Sora as the Latin fallback.
 * - Sacramento is used ONLY for the "Alsama" wordmark.
 *
 * Each exposes a CSS variable that `@theme` in globals.css maps onto the
 * Tailwind font tokens (`font-sans`, `font-display`).
 */
export const sora = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sora",
  display: "swap",
});

export const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export const sacramento = Sacramento({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-sacramento",
  display: "swap",
});
