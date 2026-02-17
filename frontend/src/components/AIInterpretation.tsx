import { useState, useEffect, useCallback } from "react";
import { interpretWellLogLLM } from "../api/client";
import type { AIInterpretLLMResult } from "../api/client";
import { useWellMeta } from "../hooks/useWellMeta";
import { Loader2, Search, Sparkles } from "lucide-react";
import { TabLoaderFull, TabLoaderOverlay } from "./TabLoader";

interface AIInterpretationProps {
  wellId: number;
  wellName: string;
}

export default function AIInterpretation({ wellId, wellName }: AIInterpretationProps) {
  const { curveNames, depthRange, loading, error: wellError } = useWellMeta(wellId);
  const [selectedCurves, setSelectedCurves] = useState<string[]>([]);
  const [depthMin, setDepthMin] = useState("");
  const [depthMax, setDepthMax] = useState("");
  const [curveSearch, setCurveSearch] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AIInterpretLLMResult | null>(null);
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
    interpretWellLogLLM(wellId, wellName, selectedCurves, min, max)
      .then((data) => setResult(data))
      .catch((e) => setError(e instanceof Error ? e.message : "AI interpretation failed"))
      .finally(() => setRunning(false));
  }, [wellId, wellName, selectedCurves, depthMin, depthMax]);

  const err = error || wellError;
  if (loading) {
    return <TabLoaderFull message="Loading curves and depth range..." />;
  }
  if (err) {
    return (
      <div className="flex items-center gap-2 text-red-600 p-4">
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
        {running && <TabLoaderOverlay message="Running AI interpretation..." />}
        <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm flex-1 min-h-0 overflow-y-auto">
          <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            {wellName} – AI Interpretation (Groq LLM)
          </h3>
          {result ? (
            <div className="space-y-5">
              <section>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">AI interpretation</h4>
                <div className="text-sm text-slate-700 bg-amber-50/60 border border-amber-200/70 rounded-xl p-4 whitespace-pre-wrap leading-relaxed shadow-sm">
                  {result.interpretation}
                </div>
              </section>

              {/* {result.statistics && (
                <section className="rounded-xl border border-slate-200 bg-slate-50/80 overflow-hidden shadow-sm">
                  <button
                    type="button"
                    onClick={() => setShowStats((s) => !s)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-100/80 transition-colors"
                    title={showStats ? "Hide statistical context" : "Show statistical context used by the AI"}
                  >
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Statistical context (input to AI)
                    </span>
                    <span className="text-slate-400 text-xs">{showStats ? "▼ Hide" : "▶ Show"}</span>
                  </button>
                  {showStats && (
                    <div className="px-4 pb-4 pt-0 space-y-4 border-t border-slate-200">
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-1">Summary</p>
                        <p className="text-sm text-slate-700 leading-relaxed">{result.statistics.summary}</p>
                      </div>
                      {result.statistics.insights.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 mb-2">Per-curve statistics & insights</p>
                          <div className="space-y-3">
                            {result.statistics.insights.map((ins) => (
                              <div
                                key={ins.curve}
                                className="rounded-lg border border-slate-200 bg-white p-3 text-sm"
                              >
                                <p className="font-semibold text-slate-800 mb-1.5">{ins.curve}</p>
                                <p className="text-slate-600 leading-relaxed mb-2">{ins.interpretation}</p>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-slate-500">
                                  <span>min {ins.statistics.min.toFixed(4)}</span>
                                  <span>max {ins.statistics.max.toFixed(4)}</span>
                                  <span>mean {ins.statistics.mean.toFixed(4)}</span>
                                  <span>σ {ins.statistics.std.toFixed(4)}</span>
                                  <span>n = {ins.statistics.count}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {result.statistics.anomalies.length > 0 && (
                        <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 p-3">
                          <p className="text-xs font-medium text-amber-800 mb-1">
                            Anomalies (beyond 2σ): {result.statistics.anomalies.length} point(s)
                          </p>
                          <p className="text-xs text-slate-600">
                            Depth range and curves with outliers are included in the statistical context sent to the AI.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )} */}
            </div>
          ) : !running && !error && (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                Select curves and depth range, then click Run AI interpretation. Uses Groq (LLM) to generate a natural-language interpretation.
              </div>
            )}
          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
        </div>
      </div>

      <div className="w-72 shrink-0 pl-4 flex flex-col">
        <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Parameters</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Curves</label>
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
                    <label key={name} className="inline-flex items-center gap-2 text-sm cursor-pointer">
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
                <label className="block text-xs font-medium text-slate-500 mb-1">Depth min</label>
                <input
                  type="number"
                  value={depthMin}
                  onChange={(e) => setDepthMin(e.target.value)}
                  step={depthRange ? (depthRange.max - depthRange.min) / 100 : 1}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                  title="Minimum depth for interpretation"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-500 mb-1">Depth max</label>
                <input
                  type="number"
                  value={depthMax}
                  onChange={(e) => setDepthMax(e.target.value)}
                  step={depthRange ? (depthRange.max - depthRange.min) / 100 : 1}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                  title="Maximum depth for interpretation"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={runInterpretation}
              disabled={running || selectedCurves.length === 0}
              className="w-full px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              title="Run AI interpretation (Groq LLM) on selected curves"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {running ? "Running…" : "Run AI interpretation"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
