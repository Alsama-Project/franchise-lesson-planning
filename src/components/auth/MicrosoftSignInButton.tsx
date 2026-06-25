"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

/** Microsoft's four-square mark, monochrome to sit on the pink button. */
function MicrosoftMark() {
  return (
    <span
      aria-hidden="true"
      className="grid grid-cols-2 gap-[2px]"
      style={{ gridTemplateColumns: "9px 9px" }}
    >
      <span className="size-[9px] bg-white opacity-95" />
      <span className="size-[9px] bg-white opacity-75" />
      <span className="size-[9px] bg-white opacity-85" />
      <span className="size-[9px] bg-white opacity-65" />
    </span>
  );
}

/**
 * Starts the Microsoft (Azure) OAuth flow with Supabase. @supabase/ssr uses the
 * PKCE flow, so this stores a code verifier and sends the user to Microsoft;
 * Microsoft returns to /auth/callback, which exchanges the code for a session.
 */
export function MicrosoftSignInButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "openid profile email",
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    // On success the browser is already navigating to Microsoft; only a failure
    // to *start* the flow lands here.
    if (error) {
      setError("Couldn't start sign-in. Please try again.");
      setPending(false);
    }
  }

  return (
    <div>
      <Button
        variant="brand"
        className="w-full"
        onClick={signIn}
        disabled={pending}
        aria-label="Sign in with Microsoft"
      >
        <MicrosoftMark />
        {pending ? "Redirecting…" : "Sign in with Microsoft"}
      </Button>
      {error ? (
        <p className="mt-3 text-[12.5px] text-status-review" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
