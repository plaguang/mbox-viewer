import React from "react";
import type { Metadata } from "next";
import Landing from "@/components/Landing";

export const metadata: Metadata = {
  title: "MBOX to CSV Converter Online Free – Export Email Archive to Excel",
  description:
    "Convert .MBOX email archives from Google Takeout or Thunderbird into clean CSV spreadsheets for Excel, Google Sheets, CRM import, or eDiscovery analysis.",
  alternates: {
    canonical: "/mbox-to-csv",
  },
};

export default function MboxToCsvPage() {
  return (
    <Landing
      badge="eDiscovery & CRM Spreadsheet Export · RFC-4180 Escaped CSV"
      h1="MBOX to CSV Converter – Export Mailbox to Excel & Google Sheets"
      subtitle="Turn any .MBOX email archive into a structured CSV spreadsheet with columns for Message-ID, Date, From, To, Subject, Attachment Count, and Body Snippet — 100% locally in your browser."
      steps={[
        {
          title: "Open Your .MBOX Archive",
          body: "Drop your Google Takeout or Thunderbird .mbox file into the local reader.",
        },
        {
          title: "Optional: Filter by Keyword or Sender",
          body: "Type a domain or keyword in the search box if you only want to export matching emails to CSV.",
        },
        {
          title: "Click 'Export Mailbox to .CSV'",
          body: "Download a properly quoted CSV file ready to open in Microsoft Excel, Google Sheets, or Python pandas.",
        },
      ]}
      faqs={[
        {
          q: "What columns are included when converting MBOX to CSV?",
          a: "The exported CSV spreadsheet includes 7 structured columns: Message_ID, Date, From, To, Subject, Attachments_Count, and Body_Snippet.",
        },
        {
          q: "Can I filter the MBOX archive before exporting to CSV?",
          a: "Yes! Any search query you type into the filter box narrows down the message list, and clicking 'Export Mailbox to .CSV' exports only the matching messages.",
        },
        {
          q: "Does the CSV handle commas and quotation marks inside email subjects?",
          a: "Yes. All fields are strictly formatted according to RFC 4180 CSV rules so commas, quotes, and line breaks never corrupt your Excel columns.",
        },
        {
          q: "Can I also export individual emails as .EML files?",
          a: "Yes. Select any message in the list and click 'Save as .EML' to download the standard RFC 822 email file.",
        },
      ]}
    />
  );
}
