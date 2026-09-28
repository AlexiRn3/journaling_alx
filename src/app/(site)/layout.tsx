// Public site shell: filter bar on top, menu fixed at the bottom, footer after the page.
import { Footer } from "@/components/site/Footer";
import { PrefsProvider } from "@/components/site/prefs";
import { TabBar } from "@/components/site/TabBar";
import { TopBar } from "@/components/site/TopBar";
import { loadDb } from "@/lib/data";
import s from "./layout.module.css";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const { meta } = loadDb();
  return (
    <PrefsProvider updatedAt={meta.updated_at}>
      <TopBar meta={meta} />
      <main className={s.main}>
        {children}
        <Footer meta={meta} />
      </main>
      <TabBar />
    </PrefsProvider>
  );
}
