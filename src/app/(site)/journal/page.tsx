import type { Metadata } from "next";
import { Suspense } from "react";
import { PageTransition } from "@/components/site/transitions";
import { loadDb, publicTrades, slugRecord } from "@/lib/data";
import { JournalFromUrl, JournalView } from "./_journal/JournalView";

export const metadata: Metadata = {
  title: "Journal",
  description: "Every trade of the account, by session day: calendar, cards and timeline.",
};

export default function JournalPage() {
  const db = loadDb();
  const trades = publicTrades(db);
  const props = { trades, slugs: slugRecord(trades), linkWindow: db.rules.link_window_seconds };
  return (
    <PageTransition>
      {/* The static HTML shows the default calendar; the query string (?view, ?day) applies on the client. */}
      <Suspense fallback={<JournalView {...props} query="" />}>
        <JournalFromUrl {...props} />
      </Suspense>
    </PageTransition>
  );
}
