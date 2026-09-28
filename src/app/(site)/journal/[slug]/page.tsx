import { publicTrades, slugRecord } from "@/lib/data";

export function generateStaticParams() {
  return Object.values(slugRecord(publicTrades())).map((slug) => ({ slug }));
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <div className="wrap" style={{ paddingTop: 72 }}><h1 className="h2">Trade {slug}</h1></div>;
}
