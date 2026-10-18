import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ServiceWorkerRegistrar } from "@/components/editor/register-sw";
import { THEME_BOOTSTRAP_SNIPPET } from "@/lib/design/themes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NovaCut Studio — Professional Video Editor",
  description:
    "A blazing-fast, installable progressive video editor. Trim, cut, add text, stickers, cinematic filters and motion — all locally in your browser. Nothing ever leaves your device.",
  keywords: ["video editor", "PWA", "NovaCut", "timeline editor", "browser video editing"],
  applicationName: "NovaCut Studio",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NovaCut Studio",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-64.png", sizes: "64x64", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#07070d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Chroma Engine — apply the saved theme before first paint (no FOUC) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SNIPPET }} />
        {/* Canvas text-rendering fonts (used by the title engine) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router single-page app; fonts power canvas text rendering */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Anton&family=Bangers&family=Bebas+Neue&family=Caveat:wght@700&family=Inter:wght@400;700&family=Lobster&family=Montserrat:wght@400;700&family=Oswald&family=Playfair+Display:ital,wght@0,400;1,400&family=Righteous&family=Space+Grotesk:wght@400;700&family=Hind+Siliguri:wght@400;600;700&family=Noto+Sans+Bengali:wght@400;600;700&family=Tiro+Bangla&display=swap"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <SonnerToaster position="bottom-center" theme="dark" />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
