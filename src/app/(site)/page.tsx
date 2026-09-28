import { PageTransition } from "@/components/site/transitions";
import { loadDb, loadStrategy, publicTrades, slugRecord } from "@/lib/data";
import { HomeView } from "./_home/HomeView";

export default function HomePage() {
  const db = loadDb();
  const trades = publicTrades(db);
  const strategy = loadStrategy();
  return (
    <PageTransition>
      <HomeView
        trades={trades}
        slugs={slugRecord(trades)}
        account={db.meta.account}
        instrument={db.meta.instrument}
        intro={strategy.home_intro}
        principles={strategy.principles.slice(0, 3).map((p) => p.title)}
      />
    </PageTransition>
  );
}
