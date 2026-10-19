import type { Metadata } from "next";
import AnalyticsProvider from "@/components/AnalyticsProvider";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://mbox-viewer-nu.vercel.app";
const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "G-8764ZP2KQ1";
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID || "yxcpqk8xbw";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Free MBOX Viewer Online – Open Google Takeout, Thunderbird & Apple Mail Locally",
    template: "%s | MboxViewer.pro",
  },
  description:
    "Open, search, and read .MBOX and .EML email archives directly in your browser with zero server upload. Extract MIME attachments and convert MBOX emails to PDF or CSV.",
  alternates: {
    canonical: "/",
  },
  verification: {
    google: "OzbbXwBKIAGRAIV-NCTTfkOO6b3YAXZjqWxCrmygypM",
  },
  openGraph: {
    title: "Free Online MBOX Viewer – Read Google Takeout & Export to PDF/CSV",
    description:
      "Inspect confidential .MBOX and .EML archives 100% locally in your browser without installing Thunderbird.",
    url: SITE_URL,
    siteName: "MboxViewer.pro",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-950 text-slate-100">
        {children}
        <AnalyticsProvider gaId={GA_ID} clarityId={CLARITY_ID} />
      </body>
    </html>
  );
}
