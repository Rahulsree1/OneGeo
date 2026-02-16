import { useState, useEffect, useCallback, useRef } from "react";
import { interpretWellLog, interpretWellLogLLM } from "../api/client";
import { useWellMeta } from "../hooks/useWellMeta";
import type { AIInterpretResult } from "../api/client";
import { Loader2, Search, FileText, Printer, Download } from "lucide-react";
import { TabLoaderFull, TabLoaderOverlay } from "./TabLoader";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";

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
    if (!reportRef.current) return;
    const printContent = reportRef.current.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow pop-ups to print the report.");
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Report – ${wellName}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 24px; max-width: 800px; margin: 0 auto; color: #1e293b; }
            h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
            h2 { font-size: 0.875rem; font-weight: 600; color: #475569; margin-top: 1.5rem; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em; }
            p, li { font-size: 0.875rem; line-height: 1.5; }
            .meta { font-size: 0.75rem; color: #64748b; margin-bottom: 1.5rem; }
            .block { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
            table { width: 100%; font-size: 0.75rem; border-collapse: collapse; }
            th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
            th { background: #f1f5f9; font-weight: 600; }
          </style>
        </head>
        <body>${printContent}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  }, [wellName]);

  const safeName = (wellName || "report").replace(/[^\w\s-]/g, "").replace(/\s+/g, "_").slice(0, 50);

  const downloadPDF = useCallback(() => {
    if (!report) return;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = 210; // A4 width in mm
    let y = 20;
    const lineH = 6;
    const margin = 20;

    doc.setFontSize(14);
    doc.text(wellName, margin, y);
    y += lineH;
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    if (fileName) doc.text(`File: ${fileName}`, margin, y);
    y += lineH;
    doc.text(`Generated: ${report.generatedAt}`, margin, y);
    y += lineH + 4;
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(11);
    doc.text("Parameters", margin, y);
    y += lineH;
    doc.setFontSize(9);
    doc.text(`Curves: ${report.params.curves.join(", ")}`, margin, y);
    y += lineH;
    doc.text(`Depth: ${report.params.depthMin} – ${report.params.depthMax}`, margin, y);
    y += lineH + 4;

    doc.setFontSize(11);
    doc.text("Summary", margin, y);
    y += lineH;
    doc.setFontSize(9);
    const summaryLines = doc.splitTextToSize(report.statistics.summary, pageW - 2 * margin);
    doc.text(summaryLines, margin, y);
    y += summaryLines.length * lineH + 4;

    if (report.statistics.insights.length > 0) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(11);
      doc.text("Insights by curve", margin, y);
      y += lineH;
      doc.setFontSize(9);
      for (const ins of report.statistics.insights) {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(`${ins.curve}: ${ins.interpretation}`, margin, y);
        y += lineH;
        doc.text(`  min=${ins.statistics.min} max=${ins.statistics.max} mean=${ins.statistics.mean} std=${ins.statistics.std} n=${ins.statistics.count}`, margin, y);
        y += lineH + 2;
      }
      y += 2;
    }

    if (report.statistics.anomalies.length > 0) {
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setFontSize(11);
      doc.text("Anomalies (2σ)", margin, y);
      y += lineH;
      doc.setFontSize(8);
      doc.text("Depth", margin, y);
      doc.text("Curve", margin + 30, y);
      doc.text("Value", margin + 55, y);
      doc.text("Mean", margin + 80, y);
      doc.text("Deviation", margin + 105, y);
      y += lineH;
      for (const a of report.statistics.anomalies) {
        if (y > 275) { doc.addPage(); y = 20; }
        doc.text(String(a.depth.toFixed(2)), margin, y);
        doc.text(a.curve_name, margin + 30, y);
        doc.text(String(a.value.toFixed(4)), margin + 55, y);
        doc.text(String(a.mean.toFixed(4)), margin + 80, y);
        doc.text(a.deviation, margin + 105, y);
        y += lineH;
      }
      y += 4;
    }

    if (report.aiInterpretation) {
      if (y > 230) { doc.addPage(); y = 20; }
      doc.setFontSize(11);
      doc.text("AI Interpretation", margin, y);
      y += lineH;
      doc.setFontSize(9);
      const aiLines = doc.splitTextToSize(report.aiInterpretation, pageW - 2 * margin);
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
        <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm flex-1 min-h-0 overflow-y-auto">
          <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-600" />
            {wellName} – Analysis & Reports
          </h3>
          {report ? (
            <div ref={reportRef} className="space-y-4 report-content">
              <div>
                <h1 className="text-lg font-semibold text-slate-900">
                  {wellName}
                </h1>
                {fileName && (
                  <p className="text-sm text-slate-500">File: {fileName}</p>
                )}
                <p className="meta">Generated: {report.generatedAt}</p>
              </div>

              <section>
                <h2>Parameters</h2>
                <p className="text-sm text-slate-700">
                  Curves: {report.params.curves.join(", ")} · Depth range:{" "}
                  {report.params.depthMin} – {report.params.depthMax}
                </p>
              </section>

              {/* Analysis section - key findings from curve interpretations */}
              <section>
                <h2>Analysis – Key findings</h2>
                <div className="block bg-slate-50 border border-slate-200">
                  {report.statistics.insights.length > 0 ? (
                    <ul className="list-disc list-inside space-y-1.5 text-sm text-slate-700">
                      {report.statistics.insights.map((ins) => (
                        <li key={ins.curve}>
                          <span className="font-medium text-slate-800">
                            {ins.curve}:
                          </span>{" "}
                          {ins.interpretation}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-600">
                      {report.statistics.summary}
                    </p>
                  )}
                  {report.statistics.anomalies.length > 0 && (
                    <p className="text-xs text-amber-700 mt-2">
                      {report.statistics.anomalies.length} anomaly points
                      (beyond 2σ) detected in the interval.
                    </p>
                  )}
                </div>
              </section>

              <section>
                <h2>Statistics summary</h2>
                <div className="block">
                  <p className="text-sm text-slate-700">
                    {report.statistics.summary}
                  </p>
                </div>
              </section>

              {report.statistics.insights.length > 0 && (
                <section>
                  <h2>Insights by curve (detail)</h2>
                  <ul className="space-y-2">
                    {report.statistics.insights.map((ins) => (
                      <li key={ins.curve} className="block text-sm">
                        <span className="font-medium text-slate-800">
                          {ins.curve}
                        </span>
                        <p className="text-slate-600 mt-0.5">
                          {ins.interpretation}
                        </p>
                        <p className="text-slate-400 text-xs mt-0.5">
                          min={ins.statistics.min} max={ins.statistics.max}{" "}
                          mean={ins.statistics.mean} std={ins.statistics.std}{" "}
                          (n={ins.statistics.count})
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {report.statistics.anomalies.length > 0 && (
                <section>
                  <h2>Anomalies (2σ)</h2>
                  <div className="block overflow-x-auto">
                    <table>
                      <thead>
                        <tr>
                          <th>Depth</th>
                          <th>Curve</th>
                          <th>Value</th>
                          <th>Mean</th>
                          <th>Deviation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.statistics.anomalies.map((a, i) => (
                          <tr key={i}>
                            <td>{a.depth.toFixed(2)}</td>
                            <td>{a.curve_name}</td>
                            <td>{a.value.toFixed(4)}</td>
                            <td>{a.mean.toFixed(4)}</td>
                            <td>{a.deviation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {report.aiInterpretation && (
                <section>
                  <h2>AI Interpretation</h2>
                  <div className="block">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                      {report.aiInterpretation}
                    </p>
                  </div>
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
            <div className="border-t border-slate-200 pt-3 mt-2">
              <p className="text-xs font-medium text-slate-500 mb-2">
                Download
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={downloadPDF}
                  disabled={!report}
                  title="Download PDF"
                  className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-medium disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  PDF
                </button>
                <button
                  type="button"
                  onClick={downloadCSV}
                  disabled={!report}
                  title="Download CSV"
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
                <button
                  type="button"
                  onClick={downloadExcel}
                  disabled={!report}
                  title="Download Excel"
                  className="px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-xs font-medium disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Excel
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={!report}
                  title="Print or Save as PDF"
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
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
