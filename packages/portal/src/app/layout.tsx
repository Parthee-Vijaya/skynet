import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeSettings } from "@/components/ThemeSettings";
import { PWARegister } from "@/components/PWARegister";

export const metadata: Metadata = {
  title: "S.K.Y.N.E.T.",
  description: "System for Knowledge, Yielding Neural Engagement & Tasks",
  manifest: "/manifest.json",
  applicationName: "Skynet",
  appleWebApp: {
    capable: true,
    title: "Skynet",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="da" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <ThemeProvider>
          {children}
          <ThemeSettings />
        </ThemeProvider>
        <PWARegister />
      </body>
    </html>
  );
}
