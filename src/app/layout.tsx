import type { Metadata, Viewport } from "next";
import { Geist_Mono, VT323 } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const vt323 = VT323({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FLAT WAR — world conquest on Robinhood Chain",
  description:
    "Claim a city. Build industry. Strike your neighbours. Take the flat world. A multiplayer war strategy game built for the world is flat hackathon on Robinhood Chain — burn $WIF for real onchain power.",
  keywords: ["flat war", "robinhood chain", "wif", "hackathon", "strategy game", "onchain"],
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌍</text></svg>",
  },
  openGraph: {
    title: "FLAT WAR",
    description: "World conquest on Robinhood Chain — burn $WIF for power.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0c0e0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistMono.variable} ${vt323.variable} font-mono antialiased bg-[#070806] text-zinc-100`}
      >
        {children}
        <Toaster position="top-center" richColors theme="dark" />
      </body>
    </html>
  );
}
