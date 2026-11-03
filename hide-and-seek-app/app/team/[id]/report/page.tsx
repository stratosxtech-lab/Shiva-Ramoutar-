"use client";

import { use, useEffect, useState } from "react";
import { api, fmtDate } from "@/components/ui";
import { ReportView, type ReportData } from "@/components/report";

// Printable leadership report. Uses a light, paper-friendly theme and the browser's own print-to-PDF.
export default function PrintableReport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [r, setR] = useState<ReportData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let key = "";
    try { key = localStorage.getItem(`hs:team:${id}`) ?? ""; } catch {}
    if (!key) { setError("Open this report from your team dashboard on this device."); return; }
    api<ReportData>(`/api/teams/${id}/report${location.search}`, { headers: { "x-team-key": key } }).then(setR).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!r) return <p className="muted">Preparing your report…</p>;
  return (
    <div className="wide print-page">
      <div className="row between no-print">
        <span className="muted">Use your browser&apos;s Print command and choose &ldquo;Save as PDF&rdquo; to share it.</span>
        <button className="btn sm" onClick={() => window.print()}>Print or save as PDF</button>
      </div>
      <div className="section-title">
        <span className="eyebrow">Hide &amp; Seek · Engagement report</span>
        <h1>{r.team}</h1>
        <p className="muted">
          {r.plan} · {r.period.from || r.period.to ? `${r.period.from ? fmtDate(r.period.from) : "Start"} to ${r.period.to ? fmtDate(r.period.to) : "today"}` : "All time"} · prepared {fmtDate(r.generatedAt)}
        </p>
      </div>
      <ReportView r={r} />
    </div>
  );
}
