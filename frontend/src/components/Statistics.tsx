import { useState, useEffect, useCallback } from "react";
import { interpretWellLog } from "../api/client";
import type { AIInterpretResult } from "../api/client";
import { useWellMeta } from "../hooks/useWellMeta";
import { Loader2, Search, BarChart2, AlertTriangle } from "lucide-react";
import { TabLoaderFull, TabLoaderOverlay } from "./TabLoader";

interface StatisticsProps {
  wellId: number;
  wellName: string;
}

export default function Statistics({ wellId, wellName }: StatisticsProps) {
  const { curveNames, depthRange, loading, error: wellError } = useWellMeta(wellId);
  const [selectedCurves, setSelectedCurves] = useState<string[]>([]);
  const [depthMin, setDepthMin] = useState("");
  const [depthMax, setDepthMax] = useState("");
  const [curveSearch, setCurveSearch] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AIInterpretResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const runInterpretation = useCallback(() => {
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
    setRunning(true);
    setResult(null);
    interpretWellLog(wellId, selectedCurves, min, max)
      .then((data) => setResult(data))
      .catch((e) => setError(e instanceof Error ? e.message : "Interpretation failed"))
      .finally(() => setRunning(false));
  }, [wellId, selectedCurves, depthMin, depthMax]);

  const err = error || wellError;
  if (loading) {
    return <TabLoaderFull message="Loading curves and depth range..." />;
  }
  if (err) {
    return (
      <div className="flex items-center gap-2 text-red-600 p-4">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <span>{err}</span>
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
      <div className="relative flex-1 min-w-0 flex flex-col overflow-hidden">
        {running && <TabLoaderOverlay message="Running statistics..." />}
        <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm flex-1 min-h-0 overflow-y-auto">
          <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-blue-500" />
            {wellName} – Statistics
          </h3>
          {result ? (
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                  Summary
                </h4>
                <p className="text-sm text-slate-700 bg-slate-50 rounded p-3">
                  {result.summary}
                </p>
              </div>
              {result.insights.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                    Insights by curve
                  </h4>
                  <ul className="space-y-3">
                    {result.insights.map((ins) => (
                      <li
                        key={ins.curve}
                        className="border border-slate-200 rounded-lg p-3 text-sm"
                      >
                        <span className="font-medium text-slate-800">
                          {ins.curve}
                        </span>
                        <p className="text-slate-600 mt-1">
                          {ins.interpretation}
                        </p>
                        <p className="text-slate-400 text-xs mt-1">
                          min={ins.statistics.min} max={ins.statistics.max}{" "}
                          mean={ins.statistics.mean} std={ins.statistics.std}{" "}
                          (n={ins.statistics.count})
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.anomalies.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Anomalies (2σ)
                  </h4>
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="text-left py-2 px-2">Depth</th>
                          <th className="text-left py-2 px-2">Curve</th>
                          <th className="text-left py-2 px-2">Value</th>
                          <th className="text-left py-2 px-2">Mean</th>
                          <th className="text-left py-2 px-2">Deviation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.anomalies.map((a, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="py-1.5 px-2">
                              {a.depth.toFixed(2)}
                            </td>
                            <td className="py-1.5 px-2">{a.curve_name}</td>
                            <td className="py-1.5 px-2">
                              {a.value.toFixed(4)}
                            </td>
                            <td className="py-1.5 px-2">{a.mean.toFixed(4)}</td>
                            <td className="py-1.5 px-2">{a.deviation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            !running &&
            !error && (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                Select curves and depth range, then click Run statistics.
              </div>
            )
          )}
          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
        </div>
      </div>

      <div className="w-72 shrink-0 pl-4 flex flex-col">
        <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">
            Parameters
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
              <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto">
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
                  title="Minimum depth for statistics"
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
                  title="Maximum depth for statistics"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={runInterpretation}
              disabled={running || selectedCurves.length === 0}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              title="Run deterministic statistics on selected curves"
            >
              {running ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <BarChart2 className="w-4 h-4" />
              )}
              {running ? "Running…" : "Run statistics"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
