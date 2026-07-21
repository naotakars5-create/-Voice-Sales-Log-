import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "Voice Sales Log",
  description: "喋るだけ営業記録",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "VoiceSales",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="min-h-dvh bg-neutral-50 text-neutral-900 antialiased">
        <div className="mx-auto min-h-dvh max-w-[560px] bg-white pb-16">
          {children}
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
