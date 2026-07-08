import Image from "next/image";
import { TabBar } from "@/components/tab-bar";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <header
        className="bg-background/90 sticky top-0 z-30 flex items-center gap-2 px-4 pb-2 backdrop-blur-lg"
        style={{ paddingTop: "max(env(safe-area-inset-top), 0.75rem)" }}
      >
        <Image
          src="/icon.svg"
          alt=""
          width={26}
          height={26}
          className="rounded-md"
        />
        <span className="text-lg font-bold tracking-tight">SnapCal</span>
      </header>
      <main className="flex-1 px-4 pt-2 pb-32">{children}</main>
      <TabBar />
    </div>
  );
}
