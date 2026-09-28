import { loadDb, publicTrades, slugRecord } from "@/lib/data";
import { PageTransition } from "@/components/site/transitions";
import { HomeView } from "./_home/HomeView";

export default function HomePage() {
  const db = loadDb();
  const trades = publicTrades(db);
  return (
    <PageTransition>
      <HomeView trades={trades} slugs={slugRecord(trades)} />
    </PageTransition>
  );
}
