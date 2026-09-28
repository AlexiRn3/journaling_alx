import Link from "next/link";
import { SiteShell } from "@/components/site/SiteShell";
import { PageTransition } from "@/components/site/transitions";

export default function NotFound() {
  return (
    <SiteShell>
      <PageTransition>
        <div className="wrap" style={{ paddingTop: 72, minHeight: "50vh" }}>
          <span className="k">Error 404</span>
          <h1 className="h1" style={{ marginTop: 14 }}>
            This page is not in the log.
          </h1>
          <p style={{ marginTop: 20, fontSize: 20, color: "var(--ink2)" }}>
            The link may be old, or the trade may have been hidden.
          </p>
          <p style={{ marginTop: 28, display: "flex", gap: 24, flexWrap: "wrap" }}>
            <Link href="/journal">Open the journal →</Link>
            <Link href="/">Back home →</Link>
          </p>
        </div>
      </PageTransition>
    </SiteShell>
  );
}
