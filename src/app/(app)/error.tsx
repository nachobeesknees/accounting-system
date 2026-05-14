"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface in the browser console so devs can grab it from screenshots.
    console.error(error);
  }, [error]);

  return (
    <>
      <PageHeader title="Something went wrong" meta="Error" />
      <div className="px-6 my-8">
        <div
          className="rounded-lg p-6"
          style={{
            border: "1px solid var(--p-review-fg)",
            background: "var(--p-review-bg)",
            maxWidth: 720,
            margin: "0 auto",
            color: "var(--p-review-fg)",
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            This page hit an unexpected error
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>
            The action wasn't applied. Try again — if it keeps failing, copy
            the error below and share it.
          </div>
          {error.digest && (
            <div
              style={{
                fontSize: 11,
                marginTop: 12,
                fontFamily: "var(--font-mono)",
                opacity: 0.75,
              }}
            >
              digest: {error.digest}
            </div>
          )}
          {error.message && (
            <pre
              style={{
                marginTop: 8,
                fontSize: 11.5,
                fontFamily: "var(--font-mono)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: "var(--p-review-fg)",
                margin: "8px 0 0 0",
              }}
            >
              {error.message}
            </pre>
          )}
          <div className="flex items-center gap-2" style={{ marginTop: 18 }}>
            <Button variant="primary" type="button" onClick={() => reset()}>
              Try again
            </Button>
            <ButtonLink variant="secondary" href="/">
              ← Dashboard
            </ButtonLink>
          </div>
        </div>
      </div>
    </>
  );
}
