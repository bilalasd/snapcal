import Image from "next/image";
import { TabBar } from "@/components/tab-bar";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <header
        className="sticky top-0 z-30 flex items-center justify-between border-b border-foreground/15 bg-background/88 px-4 pb-2 backdrop-blur-xl"
        style={{ paddingTop: "max(env(safe-area-inset-top), 0.75rem)" }}
      >
        <div className="flex items-center gap-2">
          <Image
            src="/icon.svg"
            alt=""
            width={28}
            height={28}
            className="rounded-sm ring-1 ring-foreground/15"
          />
          <div className="leading-none">
            <p className="text-[0.62rem] font-black tracking-[0.22em] uppercase text-muted-foreground">
              Daily ledger
            </p>
            <span className="text-lg font-black tracking-[-0.08em]">
              SnapCal
            </span>
          </div>
        </div>
        <span className="rounded-full border border-foreground/15 px-2 py-1 text-[0.62rem] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
          kcal
        </span>
      </header>
      <main className="editorial-grain flex-1 px-4 pt-4 pb-32">{children}</main>
      <TabBar />
    </div>
  );
}
