"use client";

import * as Sentry from "@sentry/nextjs";

export default function SentryExamplePage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center space-y-4">
        <h1 className="text-xl font-semibold">Sentry Test</h1>
        <p className="text-muted-foreground text-sm">
          Click the button to send a test error to Sentry.
        </p>
        <button
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          onClick={() => {
            Sentry.captureException(
              new Error("Sentry test error from gnubok")
            );
            alert("Test error sent to Sentry!");
          }}
        >
          Throw Test Error
        </button>
      </div>
    </div>
  );
}
