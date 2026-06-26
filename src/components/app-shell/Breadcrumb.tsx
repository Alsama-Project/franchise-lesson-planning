import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * A minimal back-link breadcrumb: a link to the Weekly Overview ("/") followed
 * by the current screen's context (e.g. "Year 1 · Group A · Mon 15 Jun"). Sits
 * above the page body inside the app shell.
 */
export async function Breadcrumb({ current }: { current: string }) {
  const t = await getTranslations("nav");
  const tc = await getTranslations("common");
  return (
    <nav aria-label={tc("breadcrumb")} className="mb-4 flex items-center gap-2 text-[13px] text-neutral-600">
      <Link
        href="/"
        className="font-medium text-teal transition-colors hover:text-[#1a6a5d] hover:underline"
      >
        {t("weeklyOverview")}
      </Link>
      {/* Reading-order separator (points to the next crumb): mirror it in RTL. */}
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="text-neutral-300 rtl:-scale-x-100"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
      <span className="text-neutral-700">{current}</span>
    </nav>
  );
}
