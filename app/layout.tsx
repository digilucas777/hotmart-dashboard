import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { ThemeBridge } from "@/components/saas/ThemeBridge";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://www.dashspeed.site'),
  title: "Dash Speed",
  description: "Dashboard de vendas Hotmart com análise em tempo real",
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Dash Speed',
  },
  openGraph: {
    title: 'Dash Speed',
    description: 'Dashboard de vendas Hotmart com análise em tempo real',
    siteName: 'Dash Speed',
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Dash Speed',
    description: 'Dashboard de vendas Hotmart com análise em tempo real',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="flex min-h-screen">
        <ThemeBridge />
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
