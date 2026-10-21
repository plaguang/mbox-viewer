"use client";

import React, { useState, useMemo } from "react";
import { trackEvent } from "@/lib/analytics";

export interface ParsedAttachment {
  filename: string;
  contentType: string;
  data: Uint8Array;
}

export interface ParsedEmail {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  messageId: string;
  textBody: string;
  htmlBody: string;
  attachments: ParsedAttachment[];
  rawSource: string;
}

// 解码 Quoted-Printable 编码文本
function decodeQuotedPrintable(input: string): string {
  const softStripped = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < softStripped.length; i++) {
    if (softStripped[i] === "=" && i + 2 < softStripped.length) {
      const hex = softStripped.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(softStripped.charCodeAt(i));
  }
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
  } catch {
    return softStripped;
  }
}

// 解码 RFC 2047 邮件头 (=?UTF-8?B?...?= 或 =?UTF-8?Q?...?=)
function decodeMimeWords(str: string): string {
  if (!str) return "";
  return str.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, _charset, enc, payload) => {
    try {
      if (enc.toUpperCase() === "B") {
        const bin = atob(payload.replace(/\s+/g, ""));
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return new TextDecoder("utf-8", { fatal: false }).decode(u8);
      } else {
        return decodeQuotedPrintable(payload.replace(/_/g, " "));
      }
    } catch {
      return payload;
    }
  });
}

// 解析单封 RFC 5322 邮件（支持 multipart/alternative、multipart/mixed、base64 与 quoted-printable）
export function parseSingleRfc822(raw: string, idx: number): ParsedEmail {
  const splitIdx = raw.search(/\r?\n\r?\n/);
  const headerPart = splitIdx >= 0 ? raw.slice(0, splitIdx) : raw;
  const bodyPart = splitIdx >= 0 ? raw.slice(splitIdx).replace(/^\r?\n\r?\n/, "") : "";

  // 展开折行 Header
  const unfoldedHeaders = headerPart.replace(/\r?\n[ \t]+/g, " ");
  const headers: Record<string, string> = {};
  for (const line of unfoldedHeaders.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon > 0) {
      const key = line.slice(0, colon).trim().toLowerCase();
      const val = line.slice(colon + 1).trim();
      headers[key] = headers[key] ? `${headers[key]}, ${val}` : val;
    }
  }

  const from = decodeMimeWords(headers["from"] || "Unknown Sender");
  const to = decodeMimeWords(headers["to"] || "Undisclosed Recipients");
  const subject = decodeMimeWords(headers["subject"] || "(No Subject)");
  const date = headers["date"] || "2026-10-19";
  const messageId = headers["message-id"] || `<msg-${idx + 1}@mbox.local>`;

  let textBody = "";
  let htmlBody = "";
  const attachments: ParsedAttachment[] = [];

  function parseEntity(entityHeaders: Record<string, string>, entityBody: string) {
    const ct = entityHeaders["content-type"] || "text/plain";
    const cte = (entityHeaders["content-transfer-encoding"] || "").toLowerCase();
    const disp = entityHeaders["content-disposition"] || "";

    const boundaryMatch = ct.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
    if (ct.toLowerCase().includes("multipart/") && boundaryMatch) {
      const boundary = boundaryMatch[1] || boundaryMatch[2];
      const parts = entityBody.split(`--${boundary}`);
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        if (part.startsWith("--")) break;
        const cleanPart = part.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
        const pSplit = cleanPart.search(/\r?\n\r?\n/);
        if (pSplit < 0) continue;
        const pHeadStr = cleanPart.slice(0, pSplit).replace(/\r?\n[ \t]+/g, " ");
        const pBodyStr = cleanPart.slice(pSplit).replace(/^\r?\n\r?\n/, "");
        const pHeaders: Record<string, string> = {};
        for (const l of pHeadStr.split(/\r?\n/)) {
          const c = l.indexOf(":");
          if (c > 0) pHeaders[l.slice(0, c).trim().toLowerCase()] = l.slice(c + 1).trim();
        }
        parseEntity(pHeaders, pBodyStr);
      }
      return;
    }

    // 检查是否为附件
    const fnMatch =
      disp.match(/filename\*?=(?:"([^"]+)"|([^;\s]+))/i) ||
      ct.match(/name=(?:"([^"]+)"|([^;\s]+))/i);
    const filename = fnMatch ? decodeMimeWords(fnMatch[1] || fnMatch[2]) : "";

    if (
      disp.toLowerCase().includes("attachment") ||
      (filename && !ct.toLowerCase().startsWith("text/"))
    ) {
      let bytes: Uint8Array;
      if (cte.includes("base64")) {
        try {
          const cleanB64 = entityBody.replace(/[^A-Za-z0-9+/=]/g, "");
          const bin = atob(cleanB64);
          bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        } catch {
          bytes = new TextEncoder().encode(entityBody);
        }
      } else {
        bytes = new TextEncoder().encode(entityBody);
      }
      attachments.push({
        filename: filename || `attachment-${attachments.length + 1}.bin`,
        contentType: ct.split(";")[0].trim(),
        data: bytes,
      });
      return;
    }

    // 解码文本正文
    let decoded = entityBody;
    if (cte.includes("base64")) {
      try {
        const bin = atob(entityBody.replace(/[^A-Za-z0-9+/=]/g, ""));
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        decoded = new TextDecoder("utf-8", { fatal: false }).decode(u8);
      } catch {
        decoded = entityBody;
      }
    } else if (cte.includes("quoted-printable")) {
      decoded = decodeQuotedPrintable(entityBody);
    }

    if (ct.toLowerCase().includes("text/html")) {
      htmlBody += (htmlBody ? "\n" : "") + decoded.trim();
    } else {
      textBody += (textBody ? "\n" : "") + decoded.trim();
    }
  }

  parseEntity(headers, bodyPart);

  // 如果只有 HTML 没有纯文本，自动提取可读纯文本摘要
  if (!textBody && htmlBody) {
    textBody = htmlBody
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+\n/g, "\n")
      .trim();
  }

  return {
    id: `email-${idx + 1}`,
    from,
    to,
    subject,
    date,
    messageId,
    textBody: textBody || "(Empty message body)",
    htmlBody,
    attachments,
    rawSource: raw.trim(),
  };
}

// 解析 MBOX 归档或单封 EML 文本
export function parseMboxOrEmlText(content: string): ParsedEmail[] {
  const normalized = content.replace(/\r\n/g, "\n");
  // MBOX 格式以行首 "From <addr> <date>" 分割多封邮件
  if (/^From\s+\S+/m.test(normalized)) {
    const chunks = normalized.split(/^From\s+[^\n]+\n/m).filter((c) => c.trim().length > 0);
    if (chunks.length > 0) {
      return chunks.map((chunk, i) => parseSingleRfc822(chunk, i));
    }
  }
  return [parseSingleRfc822(normalized, 0)];
}

// 生成内置 Google Takeout MBOX 演示归档（含 3 封典型商务/法务/财务邮件 + Base64 附件）
export function buildSampleMboxArchive(): string {
  const sampleReceiptCsvB64 = btoa(
    "Invoice_ID,Vendor,Date,Amount_USD,Status\nINV-2026-104,Cloudflare Inc.,2026-10-01,240.00,Paid\nINV-2026-119,AWS US-East,2026-10-12,892.50,Paid\n"
  );

  return [
    `From billing@stripe.com Thu Oct 15 09:14:22 2026
From: "Stripe Billing" <billing@stripe.com>
To: "Alex Rivera" <alex@riverastudio.io>
Subject: =?UTF-8?Q?Receipt_for_ Oktober_Cloud_Infrastructure_ Payout_($4,850.00)?=
Date: Thu, 15 Oct 2026 09:14:22 -0700
Message-ID: <stripe-payout-20261015@stripe.com>
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="BOUNDARY_STRIPE_001"

--BOUNDARY_STRIPE_001
Content-Type: text/plain; charset="UTF-8"
Content-Transfer-Encoding: quoted-printable

Hi Alex,

Your automatic payout of $4,850.00 USD to Silicon Valley Mercury Checking =
(**** 4829) has been initiated and will arrive by October 17, 2026.

Summary of October Settlement:
- Gross Volume: $5,000.00 USD
- Platform & Processing Fees: -$150.00 USD
- Net Transfer Amount: $4,850.00 USD

Attached is your itemized Q4 reconciliation ledger (q4-vendor-ledger.csv).

--BOUNDARY_STRIPE_001
Content-Type: text/csv; name="q4-vendor-ledger.csv"
Content-Disposition: attachment; filename="q4-vendor-ledger.csv"
Content-Transfer-Encoding: base64

${sampleReceiptCsvB64}
--BOUNDARY_STRIPE_001--`,

    `From legal@summitventures.vc Fri Oct 16 14:32:10 2026
From: "Elena Rostova (General Counsel)" <legal@summitventures.vc>
To: "Alex Rivera" <alex@riverastudio.io>, "Co-Founders" <team@riverastudio.io>
Subject: Executed SAFE Agreement & Board Consent Archive (Confidential)
Date: Fri, 16 Oct 2026 14:32:10 -0400
Message-ID: <safe-closing-8821@summitventures.vc>
MIME-Version: 1.0
Content-Type: text/plain; charset="UTF-8"

Dear Alex,

Please find below the final closing confirmation for the $250,000 Post-Money SAFE investment by Summit Ventures Fund III.

Key Wire & Escrow Coordinates:
1. Escrow Reference: SV-2026-SAFE-094
2. Valuation Cap: $8,000,000 USD
3. Pro-Rata Rights Side Letter: Included and countersigned.

Please retain this Google Takeout MBOX archive copy for your annual tax and legal compliance audit.

Best regards,
Elena Rostova, Esq.
General Counsel | Summit Ventures`,

    `From support@google-takeout.local Sat Oct 17 18:05:49 2026
From: "Google Takeout Archive Bot" <takeout-noreply@google.com>
To: "Alex Rivera" <alex@riverastudio.io>
Subject: Your Gmail MBOX Export Is Ready for Local Inspection
Date: Sat, 17 Oct 2026 18:05:49 +0000
Message-ID: <takeout-export-99201@google.com>
MIME-Version: 1.0
Content-Type: text/plain; charset="UTF-8"

Hello Alex,

Your Google Takeout archive (All Mail Including Spam and Trash.mbox) has finished packaging.

Why use a 100% Client-Side MBOX Viewer?
- No need to install Mozilla Thunderbird or wait hours for local indexing.
- Zero server uploads: confidential legal, medical, and tax emails never leave your device.
- Export individual messages to PDF for court/audit evidence or convert the full mailbox to CSV.`,
  ].join("\n\n");
}

// 纯前端生成单封或多封邮件的矢量 PDF 归档（%PDF-1.4 魔数头）
function buildEmailPdfBytes(email: ParsedEmail): Uint8Array {
  const esc = (s: string) =>
    s
      .replace(/[^\x20-\x7E]/g, " ")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");

  const ops: string[] = [];
  ops.push("0.08 0.11 0.18 rg 0 742 612 50 re f");
  ops.push("BT /F2 15 Tf 1 1 1 rg 40 760 Td (EMAIL ARCHIVE RECORD - MBOX TO PDF) Tj ET");
  ops.push(
    `BT /F1 8.5 Tf 0.75 0.85 0.98 rg 400 762 Td (${esc(email.messageId.slice(0, 34))}) Tj ET`
  );

  // 邮件头元数据框
  ops.push("0.95 0.96 0.98 rg 40 652 532 76 re f");
  ops.push("0.12 0.15 0.22 rg");
  ops.push(`BT /F2 10 Tf 50 712 Td (${esc("Subject: " + email.subject.slice(0, 75))}) Tj ET`);
  ops.push(`BT /F1 9 Tf 50 695 Td (${esc("From:    " + email.from.slice(0, 80))}) Tj ET`);
  ops.push(`BT /F1 9 Tf 50 680 Td (${esc("To:      " + email.to.slice(0, 80))}) Tj ET`);
  ops.push(`BT /F1 9 Tf 50 665 Td (${esc("Date:    " + email.date.slice(0, 60))}) Tj ET`);

  // 正文多行排版
  const rawLines = email.textBody.split(/\r?\n/);
  const wrapped: string[] = [];
  for (const line of rawLines) {
    if (line.length <= 86) {
      wrapped.push(line);
    } else {
      for (let i = 0; i < line.length; i += 86) {
        wrapped.push(line.slice(i, i + 86));
      }
    }
  }

  let y = 626;
  ops.push("0.15 0.18 0.24 rg");
  for (const l of wrapped.slice(0, 34)) {
    ops.push(`BT /F1 9.5 Tf 44 ${y} Td (${esc(l)}) Tj ET`);
    y -= 15;
  }

  if (email.attachments.length > 0) {
    const ay = Math.max(70, y - 12);
    ops.push("0.04 0.45 0.32 rg");
    ops.push(
      `BT /F2 9 Tf 44 ${ay} Td (${esc(
        "Attachments (" +
          email.attachments.length +
          "): " +
          email.attachments.map((a) => a.filename).join(", ")
      )}) Tj ET`
    );
  }

  ops.push(
    "BT /F1 8 Tf 0.5 0.55 0.65 rg 40 36 Td (Exported locally via MboxViewer.pro - 100% Client-Side Confidential Email Archive) Tj ET"
  );

  const stream = ops.join("\n");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n",
    `6 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export default function MboxWorkspace() {
  const [emails, setEmails] = useState<ParsedEmail[]>(() =>
    parseMboxOrEmlText(buildSampleMboxArchive())
  );
  const [selectedId, setSelectedId] = useState<string>("email-1");
  const [searchQuery, setSearchQuery] = useState("");
  const [archiveName, setArchiveName] = useState("google-takeout-sample.mbox");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [showRawHeaders, setShowRawHeaders] = useState(false);

  const filteredEmails = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return emails;
    return emails.filter(
      (e) =>
        e.subject.toLowerCase().includes(q) ||
        e.from.toLowerCase().includes(q) ||
        e.to.toLowerCase().includes(q) ||
        e.textBody.toLowerCase().includes(q)
    );
  }, [emails, searchQuery]);

  const activeEmail = useMemo(
    () =>
      filteredEmails.find((e) => e.id === selectedId) ||
      filteredEmails[0] ||
      emails[0] ||
      null,
    [filteredEmails, emails, selectedId]
  );

  async function handleFileUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    setArchiveName(file.name);
    // 读取前 25MB 切片，保证超大 Google Takeout MBOX 也能秒级响应不卡死
    const slice = file.slice(0, 25 * 1024 * 1024);
    const text = await slice.text();
    const parsed = parseMboxOrEmlText(text);
    setEmails(parsed);
    setSelectedId(parsed[0]?.id || "email-1");
    setStatusMsg(
      `Loaded ${parsed.length} email message(s) from ${file.name} locally in browser.`
    );
    trackEvent("mbox_file_uploaded", { count: parsed.length });
  }

  function handleLoadSampleArchive() {
    const parsed = parseMboxOrEmlText(buildSampleMboxArchive());
    setEmails(parsed);
    setSelectedId(parsed[0]?.id || "email-1");
    setArchiveName("google-takeout-sample.mbox");
    setStatusMsg(
      `Loaded Google Takeout MBOX Sample (${parsed.length} messages + CSV attachment)!`
    );
    trackEvent("mbox_sample_loaded");
  }

  function handleExportPdf() {
    if (!activeEmail) return;
    const pdfBytes = buildEmailPdfBytes(activeEmail);
    const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = activeEmail.subject
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 36);
    a.download = `${slug || "mbox-email"}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    setStatusMsg(`Exported "${activeEmail.subject}" as clean PDF document.`);
    trackEvent("mbox_export_pdf");
  }

  function handleExportCsv() {
    const escCsv = (val: string) => `"${(val || "").replace(/"/g, '""')}"`;
    const rows = [
      ["Message_ID", "Date", "From", "To", "Subject", "Attachments_Count", "Body_Snippet"].join(
        ","
      ),
      ...filteredEmails.map((e) =>
        [
          escCsv(e.messageId),
          escCsv(e.date),
          escCsv(e.from),
          escCsv(e.to),
          escCsv(e.subject),
          String(e.attachments.length),
          escCsv(e.textBody.replace(/\s+/g, " ").slice(0, 240)),
        ].join(",")
      ),
    ];
    const csvContent = rows.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${archiveName.replace(/\.[^.]+$/, "")}-emails.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    setStatusMsg(`Exported ${filteredEmails.length} email(s) to CSV spreadsheet!`);
    trackEvent("mbox_export_csv", { count: filteredEmails.length });
  }

  function handleExportSingleEml() {
    if (!activeEmail) return;
    const blob = new Blob([activeEmail.rawSource], { type: "message/rfc822" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeEmail.id}.eml`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    setStatusMsg(`Exported ${activeEmail.id}.eml (RFC 822 message).`);
    trackEvent("mbox_export_eml");
  }

  function handleDownloadAttachment(att: ParsedAttachment) {
    const blob = new Blob([att.data as unknown as BlobPart], { type: att.contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = att.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  return (
    <div className="space-y-5">
      {/* 顶部上传与一键操作栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="relative cursor-pointer rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 transition hover:bg-emerald-400 active:scale-[0.99]">
            <span className="pointer-events-none">📂 Open .MBOX / .EML File Locally</span>
            <input
              data-testid="mbox-file-input"
              type="file"
              accept=".mbox,.eml,.txt,application/mbox,message/rfc822"
              className="sr-only"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
          </label>

          <button
            type="button"
            data-testid="load-sample-mbox"
            onClick={handleLoadSampleArchive}
            className="rounded-xl bg-indigo-500/15 px-3.5 py-2 text-xs font-semibold text-indigo-300 ring-1 ring-indigo-500/40 transition hover:bg-indigo-500/25"
          >
            ✨ Load Google Takeout MBOX Sample (3 Emails)
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="export-pdf-btn"
            onClick={handleExportPdf}
            className="rounded-xl border border-emerald-500/50 bg-emerald-500/15 px-3.5 py-2 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/25"
          >
            ⬇ Export Selected Email (.PDF)
          </button>
          <button
            type="button"
            data-testid="export-csv-btn"
            onClick={handleExportCsv}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
          >
            📊 Export Mailbox to .CSV ({filteredEmails.length})
          </button>
          <button
            type="button"
            data-testid="export-eml-btn"
            onClick={handleExportSingleEml}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
          >
            ✉ Save as .EML
          </button>
        </div>
      </div>

      {statusMsg && (
        <div
          data-testid="mbox-status-banner"
          className="rounded-xl border border-emerald-500/40 bg-emerald-950/50 px-4 py-2.5 text-xs font-medium text-emerald-200"
        >
          ✓ {statusMsg}
        </div>
      )}

      {/* 双栏邮件阅读器工作台 */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* 左侧邮件列表与搜索过滤 (5 cols) */}
        <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/70 p-4 lg:col-span-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Archive: {archiveName}
            </span>
            <span
              data-testid="email-count-badge"
              className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-xs font-bold text-emerald-300"
            >
              {filteredEmails.length} / {emails.length} msgs
            </span>
          </div>

          <input
            data-testid="mbox-search-input"
            type="search"
            placeholder="Search sender, subject, or body keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500"
          />

          <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {filteredEmails.map((item, idx) => {
              const isSelected = activeEmail?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`email-row-${idx}`}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    isSelected
                      ? "border-emerald-500/60 bg-emerald-500/10"
                      : "border-slate-800/90 bg-slate-950/60 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold text-white">{item.from}</span>
                    {item.attachments.length > 0 && (
                      <span className="shrink-0 rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">
                        📎 {item.attachments.length}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs font-semibold text-emerald-300">
                    {item.subject}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{item.textBody}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* 右侧邮件详情与附件提取面板 (7 cols) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl lg:col-span-7">
          {activeEmail ? (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                    100% Local In-Browser Inspection
                  </span>
                  <h2
                    data-testid="active-email-subject"
                    className="mt-2 text-lg font-extrabold text-white"
                  >
                    {activeEmail.subject}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRawHeaders((v) => !v)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800"
                >
                  {showRawHeaders ? "Hide RFC 822 Source" : "View Raw RFC 822 Source"}
                </button>
              </div>

              <div className="mt-4 grid gap-1.5 rounded-xl bg-slate-950/80 p-3.5 text-xs">
                <div>
                  <span className="font-semibold text-slate-400">From: </span>
                  <span className="text-slate-100">{activeEmail.from}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-400">To: </span>
                  <span className="text-slate-200">{activeEmail.to}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-400">Date: </span>
                  <span className="text-slate-300">{activeEmail.date}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-400">Message-ID: </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {activeEmail.messageId}
                  </span>
                </div>
              </div>

              {/* 附件提取列表 */}
              {activeEmail.attachments.length > 0 && (
                <div className="mt-4 rounded-xl border border-indigo-500/30 bg-indigo-950/30 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">
                    Extracted MIME Attachments ({activeEmail.attachments.length})
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {activeEmail.attachments.map((att, i) => (
                      <button
                        key={i}
                        type="button"
                        data-testid={`download-attachment-${i}`}
                        onClick={() => handleDownloadAttachment(att)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/20 px-3 py-1.5 text-xs font-semibold text-indigo-200 ring-1 ring-indigo-500/40 hover:bg-indigo-500/30"
                      >
                        📎 {att.filename} ({att.data.length} B) — Download
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 邮件正文或原始 RFC 822 源码 */}
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
                {showRawHeaders ? (
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-300">
                    {activeEmail.rawSource}
                  </pre>
                ) : (
                  <div
                    data-testid="active-email-body"
                    className="whitespace-pre-wrap text-xs leading-relaxed text-slate-200"
                  >
                    {activeEmail.textBody}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No messages match your current search filter.</p>
          )}
        </div>
      </div>
    </div>
  );
}
