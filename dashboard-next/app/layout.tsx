import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MiR-Eco Monitor",
  description: "A dashboard for monitoring environmental data from MQTT.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

