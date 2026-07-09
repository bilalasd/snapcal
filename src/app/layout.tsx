import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist_Mono, Nunito } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SnapCal",
  description: "Photo-based calorie and macro tracking",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SnapCal",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf6" },
    { media: "(prefers-color-scheme: dark)", color: "#171b17" },
  ],
};

// Runs before hydration so there's no light-mode flash. Honors a saved
// preference ("light" | "dark" | "system"); "system" follows the OS live.
const darkModeScript = `
(function () {
  var mql = window.matchMedia("(prefers-color-scheme: dark)");
  function apply() {
    var pref = null;
    try { pref = localStorage.getItem("snapcal-theme"); } catch (e) {}
    var dark = pref === "dark" || ((pref === null || pref === "system") && mql.matches);
    document.documentElement.classList.toggle("dark", dark);
  }
  apply();
  mql.addEventListener("change", apply);
  window.__snapcalApplyTheme = apply;
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        suppressHydrationWarning
        className={`${nunito.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="flex min-h-full flex-col bg-background">
          <script dangerouslySetInnerHTML={{ __html: darkModeScript }} />
          {children}
          <Toaster position="top-center" />
        </body>
      </html>
    </ClerkProvider>
  );
}
