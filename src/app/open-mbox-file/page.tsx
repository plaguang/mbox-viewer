import React from "react";
import type { Metadata } from "next";
import Landing from "@/components/Landing";

export const metadata: Metadata = {
  title: "How to Open MBOX File Online Free (Google Takeout, Mac & Windows)",
  description:
    "Open .MBOX files from Google Takeout, Gmail, Apple Mail, and Thunderbird on Windows, Mac, or Chromebook without installing desktop software.",
  alternates: {
    canonical: "/open-mbox-file",
  },
};

export default function OpenMboxFilePage() {
  return (
    <Landing
      badge="Works on Windows, macOS, Linux & Chromebook · Zero Software Install"
      h1="Open MBOX File Online – Read Google Takeout & Gmail Archives"
      subtitle="Downloaded a Gmail backup from Google Takeout and don't know how to open the .mbox file? Read every message, inspect headers, and download attachments right in your browser."
      steps={[
        {
          title: "Unzip Your Google Takeout Download",
          body: "Locate the 'All mail Including Spam and Trash.mbox' file inside the Takeout/Mail/ folder on your computer.",
        },
        {
          title: "Open the .MBOX File in Your Browser",
          body: "Select the .mbox file above. Our streaming parser splits 'From ' boundaries and decodes messages in milliseconds.",
        },
        {
          title: "Read, Search & Save Important Emails",
          body: "Filter by sender or keyword and save specific emails as standalone .PDF or .EML files.",
        },
      ]}
      faqs={[
        {
          q: "Why can't Windows or macOS open an .mbox file by double-clicking it?",
          a: "An .mbox file is a concatenated plain-text mailbox archive (RFC 4155) rather than a single document. Operating systems do not include a built-in MBOX reader, which is why our browser viewer is the fastest way to inspect one.",
        },
        {
          q: "How do I open a Google Takeout MBOX file without importing it into my mail client?",
          a: "Importing a large Takeout MBOX into Apple Mail or Thunderbird can clutter your existing inbox. Opening it here lets you browse and search the archive cleanly without touching your mail app.",
        },
        {
          q: "Can I view raw RFC 822 headers like Message-ID and DKIM?",
          a: "Yes. Click 'View Raw RFC 822 Source' in the top-right corner of any selected email to inspect the complete unedited message headers.",
        },
        {
          q: "What if I also have individual .EML files?",
          a: "The file picker accepts both multi-message .MBOX archives and single-message .EML files.",
        },
      ]}
    />
  );
}
