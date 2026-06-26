import type { Metadata } from "next";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { ibmPlexSansArabic, sacramento, sora } from "./fonts";
import { dirFor, isLocale, PSEUDO_RTL_COOKIE } from "@/i18n/config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alsama Lesson Planner",
  description: "Plan and submit Alsama-format lessons.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  // Pseudo-RTL dev toggle: force dir="rtl" while keeping English text, so RTL can
  // be exercised before Arabic exists. Gated on ENABLE_PSEUDO_RTL (NOT NODE_ENV —
  // production doubles as the test environment) plus the `pseudo_rtl` cookie.
  const pseudoRtlEnabled = process.env.ENABLE_PSEUDO_RTL === "true";
  const cookieStore = await cookies();
  const pseudoRtl =
    pseudoRtlEnabled && cookieStore.get(PSEUDO_RTL_COOKIE)?.value === "1";

  const lang = pseudoRtl ? "en" : isLocale(locale) ? locale : "en";
  const dir = pseudoRtl ? "rtl" : isLocale(locale) ? dirFor(locale) : "ltr";

  return (
    <html
      lang={lang}
      dir={dir}
      className={`${sora.variable} ${ibmPlexSansArabic.variable} ${sacramento.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
