'use client';

// Last-resort error boundary. Unlike `error.tsx`, this fires when the ROOT LAYOUT
// itself throws, so it REPLACES the root layout — it must render its own <html>
// and <body>, and it runs OUTSIDE both the NextIntlClientProvider (no
// translations) and the layout-linked global stylesheet (no Tailwind classes).
// It is therefore intentionally English-only with inline styles: a minimal,
// self-contained, recoverable screen. This should almost never be seen in
// practice (route-level failures are caught by `error.tsx`).
//
// Error visibility: same contract as `error.tsx` — a server throw arrives redacted
// (digest only; full detail in the runtime log), a client throw carries its real
// message + stack, logged to the console below.

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          background: '#fbf8f3',
          color: '#2a2422',
          fontFamily:
            'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '460px',
            boxSizing: 'border-box',
            textAlign: 'center',
            background: '#ffffff',
            border: '1px solid #e7decf',
            borderRadius: '12px',
            padding: '40px 32px',
          }}
        >
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600 }}>
            Something went wrong
          </h1>
          <p
            style={{
              margin: '12px auto 26px',
              maxWidth: '360px',
              fontSize: '14px',
              lineHeight: 1.6,
              color: '#756b64',
            }}
          >
            The app hit an unexpected error. You can try again — if it keeps
            happening, the reference code below helps us track it down.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '9px',
              background: '#1f7a6c',
              color: '#ffffff',
              fontSize: '13.5px',
              fontWeight: 600,
              padding: '10px 18px',
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p
              style={{
                margin: '18px 0 0',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '11px',
                color: '#a79e94',
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
