import type { Metadata, Viewport } from "next";
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

// Runs before hydration so there's no light-mode flash; follows the system
// setting live via matchMedia.
const darkModeScript = `
(function () {
  var mql = window.matchMedia("(prefers-color-scheme: dark)");
  function apply() {
    document.documentElement.classList.toggle("dark", mql.matches);
  }
  apply();
  mql.addEventListener("change", apply);
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background">
        <script dangerouslySetInnerHTML={{ __html: darkModeScript }} />
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
