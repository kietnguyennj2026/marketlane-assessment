import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Marketlane | Independent goods, together",
  description:
    "Discover everyday goods from three independent studios. A multi-vendor marketplace demo by Kiet Nguyen.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
