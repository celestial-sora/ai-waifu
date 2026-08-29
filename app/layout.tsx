import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ai Waifu",
  description: "A mobile-first AI companion experience.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
