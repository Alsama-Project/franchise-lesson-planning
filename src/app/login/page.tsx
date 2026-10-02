import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { signInErrorKey } from "@/lib/sign-in-policy";
import { MicrosoftSignInButton } from "@/components/auth/MicrosoftSignInButton";
import { Logo } from "@/components/ui/Logo";

export const metadata: Metadata = {
  title: "Sign in · Alsama Lesson Planner",
};

/**
 * Microsoft SSO login screen — matches the approved Login design: a brand-pink
 * welcome panel (cream wordmark + education line) beside the sign-in action,
 * collapsing to a single column on mobile. The only interactive piece is the
 * OAuth button.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorKey = signInErrorKey(error);
  const t = await getTranslations("login");

  return (
    <main className="flex min-h-screen items-center justify-center p-5 sm:p-10">
      <div className="w-full max-w-[1100px]">
        <div className="grid overflow-hidden rounded-lg border border-border shadow-card md:h-[620px] md:grid-cols-[1.15fr_1fr]">
          {/* Brand / welcome panel */}
          <div className="stripe relative flex flex-col justify-between gap-12 bg-pink p-12 sm:p-[52px]">
            <Logo size="lg" tone="light" />
            <div>
              <div className="mb-[14px] text-xs font-semibold uppercase tracking-[0.16em] text-cream/70">
                Lesson Planning
              </div>
              <p className="m-0 max-w-[400px] text-[28px] font-medium leading-[1.35] text-white">
                Turn the curriculum into a clear, well-structured 50-minute
                lesson — and submit it for approval.
              </p>
            </div>
            <div className="inline-flex items-center gap-[9px] text-[13px] text-cream/85">
              <span className="size-2 rounded-full bg-cream" />
              For Alsama teachers
            </div>
          </div>

          {/* Sign-in panel */}
          <div className="flex flex-col justify-center bg-surface p-12 sm:p-[52px]">
            <h1 className="m-0 text-[25px] font-semibold">Welcome back</h1>
            <p className="mt-2 mb-[30px] text-[15px] leading-[1.55] text-text-muted">
              Sign in to plan and track your lessons for the week.
            </p>
            {errorKey ? (
              <p role="alert" dir="auto" className="mb-[18px] rounded-[10px] border border-status-review-border bg-status-review-bg px-[14px] py-[10px] text-[13.5px] leading-[1.5] text-pink">
                {t(`error.${errorKey}`)}
              </p>
            ) : null}
            <MicrosoftSignInButton />
            <p className="mt-[18px] text-[12.5px] text-text-faint">
              Trouble signing in? Ask your centre coordinator.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
