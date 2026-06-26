import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * A minimal back-link breadcrumb: a link to the Weekly Overview ("/") followed
 * by the current screen's context (e.g. "Year 1 · Group A · Mon 15 Jun"). Sits
 * above the page body inside the app shell. `current` is supplied already
 * localised by the calling surface.
 */
export async function Breadcrumb({ current }: { current: string }) {
  const t = await getTranslations("nav");
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-[13px] text-neutral-600">
      <Link
        href="/"
        className="font-medium text-teal transition-colors hover:text-[#1a6a5d] hover:underline"
      >
        {t("weeklyOverview")}
      </Link>
      {/* Reading-order separator — mirror it in RTL so it points into the flow. */}
      <span aria-hidden="true" className="inline-block text-neutral-300 rtl:-scale-x-100">›</span>
      <span className="text-neutral-700">{current}</span>
    </nav>
  );
}
