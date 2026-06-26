import { IBM_Plex_Sans_Arabic, Sacramento, Sora } from "next/font/google";

/**
 * Brand typefaces, self-hosted via next/font (no runtime request to Google).
 *
 * - Sora is the UI typeface for everything (Latin).
 * - IBM Plex Sans Arabic provides Arabic glyphs (Sora has no Arabic subset); it
 *   is applied under :lang(ar) / [dir=rtl] in globals.css, with Sora as the
 *   Latin fallback so mixed runs (e.g. "English") still render.
 * - Sacramento is used ONLY for the "Alsama" wordmark.
 *
 * Each exposes a CSS variable that `@theme` in globals.css maps onto the
 * Tailwind font tokens (`font-sans`, `font-arabic`, `font-display`).
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
  variable: "--font-ibm-plex-arabic",
  display: "swap",
});

export const sacramento = Sacramento({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-sacramento",
  display: "swap",
});
