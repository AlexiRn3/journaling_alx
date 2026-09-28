// Trade sheet: /journal/2026-09-27-1944 (PLAN.md §4 "Trade").
// Everything is prepared here from the data files; the view is a client component for the unit,
// the lightbox and the swipe between trades.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { PageTransition } from "@/components/site/transitions";
import { loadDb, publicTrades, slugRecord } from "@/lib/data";
import type { Trade } from "@/lib/types";
import { metaDescription, metaTitle } from "./_trade/text";
import { TradeView, type NavTrade, type StoryPart } from "./_trade/TradeView";

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return Object.values(slugRecord(publicTrades())).map((slug) => ({ slug }));
}

function find(slug: string) {
  const db = loadDb();
  const trades = publicTrades(db); // oldest first
  const slugs = slugRecord(trades);
  const index = trades.findIndex((t) => slugs[t.id] === slug);
  return { db, trades, slugs, index };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { db, trades, index } = find(slug);
  if (index < 0) return { title: "Trade not found" };
  const t = trades[index];
  return {
    title: metaTitle(t, db.meta.instrument),
    description: metaDescription(t, db.meta.instrument),
  };
}

const STORY: { key: keyof Trade["story"]; title: string }[] = [
  { key: "context", title: "Context" },
  { key: "scenario", title: "Scenario" },
  { key: "why", title: "Why I took it" },
  { key: "management", title: "Management" },
];

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const { db, trades, slugs, index } = find(slug);
  if (index < 0) notFound();

  const t = trades[index];
  const nav = (x: Trade | undefined): NavTrade | null => (x ? { trade: x, href: `/journal/${slugs[x.id]}` } : null);

  // Owner-written Markdown from the admin: trusted, rendered once on the server.
  const story: StoryPart[] = STORY.filter(({ key }) => t.story?.[key]?.trim()).map(({ key, title }) => ({
    key,
    title,
    html: marked.parse(t.story[key], { async: false, gfm: true }),
  }));

  return (
    // Keyed by slug: moving to another trade is an exit + enter (directional slide), not an update.
    <PageTransition key={slug}>
      <TradeView
        trade={t}
        instrument={db.meta.instrument}
        linked={t.linked_to !== null ? (trades.find((x) => x.id === t.linked_to) ?? null) : null}
        prev={nav(trades[index - 1])}
        next={nav(trades[index + 1])}
        day={trades.filter((x) => x.session_day === t.session_day).map((x) => nav(x)!)}
        avgStopPts={db.rules.avg_stop_distance_pts}
        pointValue={db.rules.point_value_usd}
        story={story}
      />
    </PageTransition>
  );
}
