import React from "react";
import Landing from "@/components/Landing";

export default function HomePage() {
  return (
    <Landing
      badge="100% Local In-Browser · Zero Server Upload · No Thunderbird Required"
      h1="Free MBOX Viewer Online – Open & Search Email Archives Locally"
      subtitle="Instantly open .MBOX and .EML archives from Google Takeout (Gmail), Mozilla Thunderbird, and Apple Mail right inside your browser. Search messages, extract Base64 attachments, and export to PDF or CSV without uploading private emails."
      steps={[
        {
          title: "Select Your .MBOX or .EML Archive",
          body: "Click 'Open .MBOX / .EML File Locally' to parse your mailbox directly in browser memory using the FileSlice API.",
        },
        {
          title: "Filter by Sender, Subject, or Keyword",
          body: "Instantly search across decoded RFC 2047 subjects, Quoted-Printable bodies, and MIME attachments.",
        },
        {
          title: "Export to PDF, CSV, or Individual .EML",
          body: "Download court-ready PDF email records, export your entire mailbox index to a CSV spreadsheet, or save attachments.",
        },
      ]}
      faqs={[
        {
          q: "Are my confidential MBOX emails uploaded to any server?",
          a: "Never. Every email header, message body, and attachment is parsed 100% locally inside your web browser using JavaScript. Your files never leave your computer.",
        },
        {
          q: "Can I open a Google Takeout Gmail .mbox file without installing Thunderbird?",
          a: "Yes. Google Takeout exports all Gmail messages into a single .mbox file. Simply select that file above to browse, search, and export your emails immediately.",
        },
        {
          q: "Does this viewer decode Quoted-Printable and Base64 encoded emails?",
          a: "Yes. Our RFC 5322 / MIME parser automatically decodes UTF-8 Base64, Quoted-Printable (=3D, soft line breaks), and RFC 2047 encoded subject headers.",
        },
        {
          q: "Can I extract attachments embedded inside an MBOX file?",
          a: "Yes. Any MIME attachment found inside an email is listed above the message body with a 1-click download button.",
        },
      ]}
    />
  );
}
