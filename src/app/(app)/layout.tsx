import { TabBar } from "@/components/tab-bar";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <main className="flex-1 px-4 pt-4 pb-28">{children}</main>
      <TabBar />
    </div>
  );
}
