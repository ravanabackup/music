import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import {
  Space_Grotesk,
  Plus_Jakarta_Sans,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "PulseCast Live — Mobile Media Broadcast & PC Remote",
  description:
    "Real-time PWA + Android Companion Bridge that broadcasts live mobile media playback to a shareable link with Now Playing metadata, Last.fm scrobble history, and remote controls.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PulseCast",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090B",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${plusJakarta.variable} ${jetbrainsMono.variable} dark`}
    >
      <body
        style={{ fontFamily: "var(--font-sans), sans-serif" }}
        className="min-h-screen bg-[#09090B] text-zinc-50 antialiased selection:bg-emerald-500/30 selection:text-emerald-200"
      >
        {children}
      </body>
    </html>
  );
}
