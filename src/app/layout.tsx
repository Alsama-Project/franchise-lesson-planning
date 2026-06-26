import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { ibmPlexSansArabic, sacramento, sora } from "./fonts";
import { dirForLocale } from "@/i18n/config";
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

  return (
    <html
      lang={locale}
      dir={dirForLocale(locale)}
      className={`${sora.variable} ${ibmPlexSansArabic.variable} ${sacramento.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
