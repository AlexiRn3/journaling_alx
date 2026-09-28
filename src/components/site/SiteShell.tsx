// Public site shell: filter bar on top, menu fixed at the bottom, footer after the page.
// Used by the (site) layout and by the global 404 page.
import { loadDb } from "@/lib/data";
import { Footer } from "./Footer";
import { PrefsProvider } from "./prefs";
import { TabBar } from "./TabBar";
import { TopBar } from "./TopBar";
import s from "./SiteShell.module.css";

export function SiteShell({ children }: { children: React.ReactNode }) {
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
