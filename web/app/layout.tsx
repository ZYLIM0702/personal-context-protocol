import type { Metadata, Viewport } from "next";
import "@openuidev/react-ui/styles/index.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "PCP · Personal Context Protocol",
  description:
    "An open, agent-agnostic protocol for your personal context. Any agent proposes; your Personal Context re-ranks on your device with Qloo taste intelligence.",
  icons: {
    icon: [{ url: "/brand/favicon.png", type: "image/png", sizes: "64x64" }],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body>{children}</body>
    </html>
  );
}
