import { Suspense } from "react";
import { TabBar } from "@/components/tab-bar";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      {/* No app-name chrome — each screen carries its own title (app, not a
          website). Content owns the top safe-area inset. */}
      <main
        className="editorial-grain flex-1 px-4 pb-32"
        style={{ paddingTop: "max(env(safe-area-inset-top), 1.25rem)" }}
      >
        {children}
      </main>
      <Suspense fallback={null}>
        <TabBar />
      </Suspense>
    </div>
  );
}
