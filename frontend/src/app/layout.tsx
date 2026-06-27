import type { Metadata } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "VyOS Fabric — Network Operations Console",
  description:
    "Manage, monitor, and deploy VyOS routers at scale. One console for your entire network fabric.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${jetbrainsMono.variable} h-full`}
      style={
        {
          "--qz-font-sans": "var(--font-manrope), ui-sans-serif, system-ui, sans-serif",
          "--qz-font-mono":
            "var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        } as React.CSSProperties
      }
    >
      <body className="h-full antialiased">
        {children}
      </body>
    </html>
  );
}
