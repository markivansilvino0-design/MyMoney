import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MyMoney",
  description: "Personal savings, income and expense tracker",
  // Versioned query forces mobile browsers to re-fetch the manifest after an icon update.
  manifest: "/manifest.webmanifest?v=20260918",
  applicationName: "MyMoney",
  appleWebApp: {
    capable: true,
    title: "MyMoney",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      {
        url: "/mymoney-icon-v20260918-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/mymoney-icon-v20260918-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        url: "/mymoney-favicon-v20260918-32.png",
        sizes: "32x32",
        type: "image/png",
      },
    ],
    shortcut: [
      {
        url: "/mymoney-favicon-v20260918-32.png",
        sizes: "32x32",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/mymoney-apple-icon-v20260918-180.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b5cff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
