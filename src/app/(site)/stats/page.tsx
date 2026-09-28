import { PageTransition } from "@/components/site/transitions";

export default function Page() {
  return <PageTransition><div className="wrap" style={{ paddingTop: 72 }}><h1 className="h1">Stats</h1></div></PageTransition>;
}
