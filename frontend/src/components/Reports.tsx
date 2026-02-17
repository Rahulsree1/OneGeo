import { useState, useEffect, useCallback, useRef } from "react";
import { interpretWellLog, interpretWellLogLLM } from "../api/client";
import { useWellMeta } from "../hooks/useWellMeta";
import type { AIInterpretResult } from "../api/client";
import { Loader2, Search, FileText, Printer, Download } from "lucide-react";
import { TabLoaderFull, TabLoaderOverlay } from "./TabLoader";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";

/** Logo for PDF header: use public logo if available (index.html references /logo.png) */
const PDF_LOGO_URL = typeof window !== "undefined" ? `${window.location.origin}/logo.png` : "";

/** Load image from URL as base64 data URL for jsPDF */
function loadImageAsDataUrl(url: string): Promise<string> {
  return fetch(url)
    .then((r) => r.blob())
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        })
    );
}

interface ReportsProps {
  wellId: number;
  wellName: string;
  fileName?: string;
}

type ReportData = {
  statistics: AIInterpretResult;
  aiInterpretation: string | null;
  params: { curves: string[]; depthMin: number; depthMax: number };
  generatedAt: string;
};

export default function Reports({ wellId, wellName, fileName }: ReportsProps) {
  const { curveNames, depthRange, loading, error: wellError } = useWellMeta(wellId);
  const [selectedCurves, setSelectedCurves] = useState<string[]>([]);
  const [depthMin, setDepthMin] = useState("");
  const [depthMax, setDepthMax] = useState("");
  const [curveSearch, setCurveSearch] = useState("");
  const [includeAI, setIncludeAI] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (depthRange) {
      setDepthMin(String(depthRange.min));
      setDepthMax(String(depthRange.max));
    }
  }, [depthRange]);

  const filteredCurveNames = curveSearch.trim()
    ? curveNames.filter((name) => name.toLowerCase().includes(curveSearch.trim().toLowerCase()))
    : curveNames;

  const toggleCurve = (name: string) => {
    setSelectedCurves((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  };

  const generateReport = useCallback(() => {
    if (selectedCurves.length === 0) {
      setError("Select at least one curve");
      return;
    }
    const min = parseFloat(depthMin);
    const max = parseFloat(depthMax);
    if (Number.isNaN(min) || Number.isNaN(max) || min >= max) {
      setError("Enter valid depth range (min < max)");
      return;
    }
    setError(null);
    setGenerating(true);
    setReport(null);

    const run = async () => {
      const stats = await interpretWellLog(wellId, selectedCurves, min, max);
      let aiText: string | null = null;
      if (includeAI) {
        try {
          const llm = await interpretWellLogLLM(wellId, wellName, selectedCurves, min, max);
          aiText = llm.interpretation;
        } catch {
          aiText = "AI interpretation could not be generated (check GROQ_API_KEY or try again).";
        }
      }
      setReport({
        statistics: stats,
        aiInterpretation: aiText,
        params: { curves: selectedCurves, depthMin: min, depthMax: max },
        generatedAt: new Date().toLocaleString(),
      });
    };

    run()
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to generate report"))
      .finally(() => setGenerating(false));
  }, [wellId, wellName, selectedCurves, depthMin, depthMax, includeAI]);

  const handlePrint = useCallback(() => {
    if (!reportRef.current || !report) return;
    const printContent = reportRef.current.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow pop-ups to print the report.");
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <title>Report – ${wellName} | ONE GEO</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; padding: 24px 32px; max-width: 800px; margin: 0 auto; color: #1e293b; font-size: 14px; line-height: 1.5; }
            .report-content { margin: 0; }
            .report-content > div:first-child { background: linear-gradient(to bottom right, #f8fafc, #f1f5f9); border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
            .report-content h1 { font-size: 1.35rem; font-weight: 700; margin: 0 0 4px 0; color: #0f172a; }
            .report-content h2 { font-size: 0.7rem; font-weight: 600; color: #475569; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.06em; }
            .report-content section { border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 16px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
            .report-content section.bg-amber-50 { background: #fffbeb; border-color: #fde68a; }
            .report-content section.bg-slate-50 { background: #f8fafc; }
            .report-content section.bg-indigo-50 { background: #eef2ff; border-color: #c7d2fe; }
            .report-content ul { margin: 0; padding-left: 20px; }
            .report-content li { margin-bottom: 6px; }
            .report-content table { width: 100%; font-size: 12px; border-collapse: collapse; }
            .report-content th, .report-content td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }
            .report-content th { background: #f1f5f9; font-weight: 600; color: #475569; }
            .report-content tr:hover { background: #f8fafc; }
            .report-content p { margin: 0 0 8px 0; }
            .report-content p:last-child { margin-bottom: 0; }
            .report-content .text-xs { font-size: 11px; color: #64748b; margin-top: 6px; }
            @media print { body { padding: 16px; } .report-content section { break-inside: avoid; } }
          </style>
        </head>
        <body><div class="report-content">${printContent}</div></body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 300);
  }, [wellName, report]);

  const safeName = (wellName || "report").replace(/[^\w\s-]/g, "").replace(/\s+/g, "_").slice(0, 50);

  const downloadPDF = useCallback(async () => {
    if (!report) return;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = 210;
    const margin = 20;
    const contentW = pageW - 2 * margin;
    let y = 20;
    const lineH = 5.5;
    const sectionGap = 6;

    const pushPageIfNeeded = (need: number) => {
      if (y + need > 277) {
        doc.addPage();
        y = 20;
      }
    };

    if (PDF_LOGO_URL) {
      try {
        const logoData = await loadImageAsDataUrl(PDF_LOGO_URL);
        doc.addImage(logoData, "PNG", margin, 12, 18, 18);
      } catch {
        /* logo optional */
      }
    }
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text("ONE GEO", margin + 22, 20);
    doc.setFontSize(12);
    doc.setTextColor(51, 65, 85);
    doc.text(wellName, margin + 22, 26);
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    if (fileName) doc.text(`File: ${fileName}`, margin, 34);
    doc.text(`Generated: ${report.generatedAt}`, margin, 40);
    y = 48;

    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageW - margin, y);
    y += sectionGap;

    doc.setFontSize(11);
    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "bold");
    doc.text("Parameters", margin, y);
    y += lineH;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`Curves: ${report.params.curves.join(", ")}`, margin, y);
    y += lineH;
    doc.text(`Depth: ${report.params.depthMin} – ${report.params.depthMax}`, margin, y);
    y += lineH + sectionGap;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Key findings", margin, y);
    y += lineH;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    if (report.statistics.insights.length > 0) {
      for (const ins of report.statistics.insights) {
        pushPageIfNeeded(lineH * 3);
        const line = `${ins.curve}: ${ins.interpretation}`;
        const lines = doc.splitTextToSize(line, contentW);
        doc.text(lines, margin, y);
        y += lines.length * lineH + 2;
      }
      if (report.statistics.anomalies.length > 0) {
        doc.setTextColor(180, 83, 9);
        doc.text(`${report.statistics.anomalies.length} anomaly point(s) beyond 2σ.`, margin, y);
        y += lineH;
        doc.setTextColor(71, 85, 105);
      }
    } else {
      const summaryLines = doc.splitTextToSize(report.statistics.summary, contentW);
      doc.text(summaryLines, margin, y);
      y += summaryLines.length * lineH;
    }
    y += sectionGap;

    doc.setFont("helvetica", "bold");
    doc.text("Statistics summary", margin, y);
    y += lineH;
    doc.setFont("helvetica", "normal");
    const sumLines = doc.splitTextToSize(report.statistics.summary, contentW);
    doc.text(sumLines, margin, y);
    y += sumLines.length * lineH + sectionGap;

    if (report.statistics.insights.length > 0) {
      pushPageIfNeeded(lineH * 4);
      doc.setFont("helvetica", "bold");
      doc.text("Insights by curve", margin, y);
      y += lineH;
      doc.setFont("helvetica", "normal");
      for (const ins of report.statistics.insights) {
        pushPageIfNeeded(lineH * 5);
        doc.text(ins.curve, margin, y);
        y += lineH;
        const interpLines = doc.splitTextToSize(ins.interpretation, contentW);
        doc.text(interpLines, margin, y);
        y += interpLines.length * lineH;
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`min ${ins.statistics.min.toFixed(4)}  max ${ins.statistics.max.toFixed(4)}  mean ${ins.statistics.mean.toFixed(4)}  σ ${ins.statistics.std.toFixed(4)}  n=${ins.statistics.count}`, margin, y);
        y += lineH + 2;
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
      }
      y += 2;
    }

    if (report.statistics.anomalies.length > 0) {
      pushPageIfNeeded(40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(51, 65, 85);
      doc.text("Anomalies (2σ)", margin, y);
      y += lineH;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const colW = [22, 35, 32, 32, 38];
      let x = margin;
      ["Depth", "Curve", "Value", "Mean", "Deviation"].forEach((h, i) => {
        doc.text(h, x, y);
        x += colW[i];
      });
      y += lineH;
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y - 2, pageW - margin, y - 2);
      for (const a of report.statistics.anomalies) {
        pushPageIfNeeded(lineH + 2);
        x = margin;
        doc.text(a.depth.toFixed(2), x, y);
        doc.text(a.curve_name.substring(0, 12), x + colW[0], y);
        doc.text(a.value.toFixed(4), x + colW[0] + colW[1], y);
        doc.text(a.mean.toFixed(4), x + colW[0] + colW[1] + colW[2], y);
        doc.text(a.deviation, x + colW[0] + colW[1] + colW[2] + colW[3], y);
        y += lineH;
      }
      y += sectionGap;
    }

    if (report.aiInterpretation) {
      pushPageIfNeeded(30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(67, 56, 202);
      doc.text("AI Interpretation", margin, y);
      y += lineH;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      const aiLines = doc.splitTextToSize(report.aiInterpretation, contentW);
      doc.text(aiLines, margin, y);
    }

    doc.save(`${safeName}_report.pdf`);
  }, [report, wellName, fileName, safeName]);

  const downloadCSV = useCallback(() => {
    if (!report) return;
    const rows: string[][] = [];
    const esc = (v: string | number) => {
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    rows.push(["Well", wellName]);
    if (fileName) rows.push(["File", fileName]);
    rows.push(["Generated", report.generatedAt]);
    rows.push(["Depth min", String(report.params.depthMin)]);
    rows.push(["Depth max", String(report.params.depthMax)]);
    rows.push(["Curves", report.params.curves.join("; ")]);
    rows.push([]);
    rows.push(["Summary", report.statistics.summary]);
    rows.push([]);
    rows.push(["Curve", "Interpretation", "Min", "Max", "Mean", "Std", "Count"]);
    for (const ins of report.statistics.insights) {
      rows.push([
        ins.curve,
        ins.interpretation,
        String(ins.statistics.min),
        String(ins.statistics.max),
        String(ins.statistics.mean),
        String(ins.statistics.std),
        String(ins.statistics.count),
      ]);
    }
    rows.push([]);
    rows.push(["Depth", "Curve", "Value", "Mean", "Deviation"]);
    for (const a of report.statistics.anomalies) {
      rows.push([String(a.depth), a.curve_name, String(a.value), String(a.mean), a.deviation]);
    }
    if (report.aiInterpretation) {
      rows.push([]);
      rows.push(["AI Interpretation", report.aiInterpretation]);
    }
    const csv = rows.map((r) => r.map(esc).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}_report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report, wellName, fileName, safeName]);

  const downloadExcel = useCallback(() => {
    if (!report) return;
    const wb = XLSX.utils.book_new();
    const info = [
      ["Well", wellName],
      ["File", fileName || ""],
      ["Generated", report.generatedAt],
      ["Depth min", report.params.depthMin],
      ["Depth max", report.params.depthMax],
      ["Curves", report.params.curves.join(", ")],
      [],
      ["Summary"],
      [report.statistics.summary],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(info), "Info");

    const insightsData = [
      ["Curve", "Interpretation", "Min", "Max", "Mean", "Std", "Count"],
      ...report.statistics.insights.map((ins) => [
        ins.curve,
        ins.interpretation,
        ins.statistics.min,
        ins.statistics.max,
        ins.statistics.mean,
        ins.statistics.std,
        ins.statistics.count,
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(insightsData), "Insights");

    const anomaliesData = [
      ["Depth", "Curve", "Value", "Mean", "Deviation"],
      ...report.statistics.anomalies.map((a) => [a.depth, a.curve_name, a.value, a.mean, a.deviation]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(anomaliesData), "Anomalies");

    if (report.aiInterpretation) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([["AI Interpretation"], [report.aiInterpretation]]),
        "AI Interpretation"
      );
    }

    XLSX.writeFile(wb, `${safeName}_report.xlsx`);
  }, [report, wellName, fileName, safeName]);

  if (loading) {
    return <TabLoaderFull message="Loading curves and depth range..." />;
  }
  if (wellError) {
    return (
      <div className="flex items-center gap-2 text-red-600 p-4">
        <span>{wellError}</span>
      </div>
    );
  }
  if (curveNames.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] text-slate-600">
        <p>No curve data found for this well.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex min-h-0">
      {/* Report content (left) - printable */}
      <div className="relative flex-1 min-w-0 flex flex-col overflow-hidden">
        {generating && (
          <TabLoaderOverlay message="Generating analysis & report..." />
        )}
        <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm flex-1 min-h-0 overflow-y-auto">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">{wellName}</h3>
              <p className="text-xs text-slate-500">Analysis & Reports</p>
            </div>
          </div>
          {report ? (
            <div ref={reportRef} className="report-content space-y-6">
              {/* Header block */}
              <div className="rounded-xl bg-gradient-to-br from-slate-50 to-slate-100/80 border border-slate-200 p-5">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">{wellName}</h1>
                {fileName && (
                  <p className="text-sm text-slate-600 mt-0.5">File: {fileName}</p>
                )}
                <p className="text-xs text-slate-500 mt-2 font-medium">Generated: {report.generatedAt}</p>
              </div>

              {/* Parameters */}
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Parameters</h2>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
                  <span><strong className="text-slate-800">Curves:</strong> {report.params.curves.join(", ")}</span>
                  <span><strong className="text-slate-800">Depth:</strong> {report.params.depthMin} – {report.params.depthMax}</span>
                </div>
              </section>

              {/* Executive summary / Key findings */}
              <section className="rounded-xl border border-slate-200 bg-amber-50/50 p-4 shadow-sm">
                <h2 className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-3">Key findings</h2>
                {report.statistics.insights.length > 0 ? (
                  <ul className="space-y-2">
                    {report.statistics.insights.map((ins) => (
                      <li key={ins.curve} className="text-sm text-slate-700">
                        <span className="font-semibold text-slate-800">{ins.curve}:</span> {ins.interpretation}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-700 leading-relaxed">{report.statistics.summary}</p>
                )}
                {report.statistics.anomalies.length > 0 && (
                  <p className="text-xs text-amber-700 font-medium mt-3">
                    {report.statistics.anomalies.length} anomaly point(s) beyond 2σ in this interval.
                  </p>
                )}
              </section>

              {/* Statistics summary */}
              <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Statistics summary</h2>
                <p className="text-sm text-slate-700 leading-relaxed">{report.statistics.summary}</p>
              </section>

              {/* Insights by curve */}
              {report.statistics.insights.length > 0 && (
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Insights by curve</h2>
                  <div className="space-y-4">
                    {report.statistics.insights.map((ins) => (
                      <div key={ins.curve} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                        <p className="font-semibold text-slate-800 text-sm">{ins.curve}</p>
                        <p className="text-sm text-slate-600 mt-1 leading-relaxed">{ins.interpretation}</p>
                        <p className="text-xs text-slate-400 mt-2 font-mono">
                          min {ins.statistics.min.toFixed(4)} · max {ins.statistics.max.toFixed(4)} · mean {ins.statistics.mean.toFixed(4)} · σ {ins.statistics.std.toFixed(4)} · n={ins.statistics.count}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Anomalies table */}
              {report.statistics.anomalies.length > 0 && (
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm overflow-hidden">
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Anomalies (2σ)</h2>
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-600 text-left">
                          <th className="py-2 px-3 font-semibold rounded-tl-lg">Depth</th>
                          <th className="py-2 px-3 font-semibold">Curve</th>
                          <th className="py-2 px-3 font-semibold">Value</th>
                          <th className="py-2 px-3 font-semibold">Mean</th>
                          <th className="py-2 px-3 font-semibold rounded-tr-lg">Deviation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.statistics.anomalies.map((a, i) => (
                          <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/50">
                            <td className="py-2 px-3 text-slate-700 font-mono">{a.depth.toFixed(2)}</td>
                            <td className="py-2 px-3 text-slate-700">{a.curve_name}</td>
                            <td className="py-2 px-3 text-slate-700 font-mono">{a.value.toFixed(4)}</td>
                            <td className="py-2 px-3 text-slate-700 font-mono">{a.mean.toFixed(4)}</td>
                            <td className="py-2 px-3 text-slate-600 text-xs">{a.deviation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* AI Interpretation */}
              {report.aiInterpretation && (
                <section className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm">
                  <h2 className="text-xs font-semibold text-indigo-700 uppercase tracking-wider mb-3">AI interpretation</h2>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{report.aiInterpretation}</p>
                </section>
              )}
            </div>
          ) : (
            !generating &&
            !error && (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                Select curves and depth range, optionally enable AI Interpretation, then click Generate report to run analysis and build the report.
              </div>
            )
          )}
          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
        </div>
      </div>

      {/* Right: parameters + actions (hidden when printing) */}
      <div className="w-72 shrink-0 pl-4 flex flex-col print:hidden">
        <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">
            Analysis & report options
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Curves
              </label>
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={curveSearch}
                  onChange={(e) => setCurveSearch(e.target.value)}
                  placeholder="Search curves..."
                  className="w-full pl-8 pr-2 py-1.5 border border-slate-300 rounded text-sm placeholder:text-slate-400"
                  title="Search curve names"
                />
              </div>
              <div className="flex flex-col gap-1.5 max-h-42 overflow-y-auto">
                {filteredCurveNames.length === 0 ? (
                  <p className="text-slate-400 text-xs py-1">No curves match</p>
                ) : (
                  filteredCurveNames.map((name) => (
                    <label
                      key={name}
                      className="inline-flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCurves.includes(name)}
                        onChange={() => toggleCurve(name)}
                        className="rounded border-slate-300"
                      />
                      {name}
                    </label>
                  ))
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Depth min
                </label>
                <input
                  type="number"
                  value={depthMin}
                  onChange={(e) => setDepthMin(e.target.value)}
                  step={
                    depthRange ? (depthRange.max - depthRange.min) / 100 : 1
                  }
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                  title="Minimum depth for report"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Depth max
                </label>
                <input
                  type="number"
                  value={depthMax}
                  onChange={(e) => setDepthMax(e.target.value)}
                  step={
                    depthRange ? (depthRange.max - depthRange.min) / 100 : 1
                  }
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                  title="Maximum depth for report"
                />
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer" title="Add AI interpretation (Groq LLM) to the report">
              <input
                type="checkbox"
                checked={includeAI}
                onChange={(e) => setIncludeAI(e.target.checked)}
                className="rounded border-slate-300"
              />
              Include AI Interpretation (Groq)
            </label>
            <button
              type="button"
              onClick={generateReport}
              disabled={generating || selectedCurves.length === 0}
              className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              title="Generate analysis and report with selected curves and depth range"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              {generating ? "Generating…" : "Generate analysis & report"}
            </button>
            <div className="border-t border-slate-200 pt-4 mt-3">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">
                Export report
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void downloadPDF()}
                  disabled={!report}
                  title="Download as PDF (with logo and clean layout)"
                  className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-medium disabled:opacity-50 flex items-center justify-center gap-1.5 border border-red-100"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  PDF
                </button>
                <button
                  type="button"
                  onClick={downloadCSV}
                  disabled={!report}
                  title="Download as CSV"
                  className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium disabled:opacity-50 flex items-center justify-center gap-1.5 border border-emerald-100"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  CSV
                </button>
                <button
                  type="button"
                  onClick={downloadExcel}
                  disabled={!report}
                  title="Download as Excel"
                  className="px-3 py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-xs font-medium disabled:opacity-50 flex items-center justify-center gap-1.5 border border-green-100"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  Excel
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={!report}
                  title="Print or save as PDF from browser"
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium disabled:opacity-50 flex items-center justify-center gap-1.5 border border-slate-200"
                >
                  <Printer className="w-4 h-4 shrink-0" />
                  Print
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
