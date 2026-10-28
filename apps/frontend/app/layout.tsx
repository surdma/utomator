import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";

const inter = Inter({ variable: "--font-sans", subsets: ["latin"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], display: "swap" });
export const viewport: Viewport = { themeColor: "#f8fafc", width: "device-width", initialScale: 1 };
export const metadata: Metadata = {
  title: { default: "Utomator | Local-first social automation", template: "%s | Utomator" },
  description: "A local-first workspace for reviewed social automation, LinkedIn editorial research, profile workflows, and growth tools.",
  applicationName: "Utomator",
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
  robots: { index: true, follow: true },
  icons: { icon: "/icon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${mono.variable} font-sans min-h-dvh flex flex-col noise`}>
        <Navbar />
        <div className="flex w-full flex-1 flex-col">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
