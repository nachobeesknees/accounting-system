import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";

export default function NotFound() {
  return (
    <>
      <PageHeader title="Not found" meta="404" />
      <div className="px-6 my-8">
        <div
          className="rounded-lg p-6 text-center"
          style={{
            border: "1px solid var(--line)",
            background: "var(--raised)",
            maxWidth: 520,
            margin: "0 auto",
          }}
        >
          <div
            style={{
              fontSize: 36,
              color: "var(--ink-4)",
              fontFamily: "var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
            }}
          >
            404
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--ink)",
              marginTop: 6,
            }}
          >
            We couldn't find that page
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--ink-3)",
              marginTop: 6,
              lineHeight: 1.55,
            }}
          >
            The record may have been deleted, the URL may be wrong, or you may
            not have access. Use the sidebar to jump back into the app.
          </div>
          <div
            className="flex items-center justify-center gap-2"
            style={{ marginTop: 18 }}
          >
            <ButtonLink variant="secondary" href="/">
              ← Dashboard
            </ButtonLink>
            <ButtonLink variant="primary" href="/journal">
              Journal entries
            </ButtonLink>
          </div>
        </div>
      </div>
    </>
  );
}
