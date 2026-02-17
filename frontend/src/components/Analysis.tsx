import React, { useState, useEffect, useCallback, useRef } from "react";
import { getCurveData } from "../api/client";
import { useWellMeta } from "../hooks/useWellMeta";
import { Loader2, ZoomIn, ZoomOut, Move, Search, Maximize2 } from "lucide-react";
import { TabLoaderFull, TabLoaderOverlay } from "./TabLoader";

const CURVE_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#9333ea", "#0891b2"];

/** Split text by search term (case-insensitive) and return segments; matching parts are wrapped for highlight. */
function highlightMatch(text: string, search: string): React.ReactNode {
  const q = search.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const pos = lower.indexOf(needle, i);
    if (pos === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (pos > i) parts.push(text.slice(i, pos));
    parts.push(
      <mark key={pos} className="bg-amber-200 text-slate-900 rounded px-0.5 font-medium">
        {text.slice(pos, pos + needle.length)}
      </mark>
    );
    i = pos + needle.length;
  }
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

interface AnalysisProps {
  wellId: number;
  wellName: string;
}

export default function Analysis({ wellId, wellName }: AnalysisProps) {
  const { curveNames, depthRange, loading, error: wellError } = useWellMeta(wellId);
  const [selectedCurves, setSelectedCurves] = useState<string[]>([]);
  const [depthMin, setDepthMin] = useState("");
  const [depthMax, setDepthMax] = useState("");
  const [chartData, setChartData] = useState<{ depth: number[]; [key: string]: number[] } | null>(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [curveSearch, setCurveSearch] = useState("");
  /** Per-curve scale: auto (use data min/max) or manual min/max */
  const [curveScales, setCurveScales] = useState<Record<string, { auto: boolean; min: number; max: number }>>({});

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (depthRange) {
      setDepthMin(String(depthRange.min));
      setDepthMax(String(depthRange.max));
    }
  }, [depthRange]);

  const loadChart = useCallback(() => {
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
    setLoadingChart(true);
    getCurveData(wellId, selectedCurves, min, max)
      .then((data) => {
        setChartData(data);
        setZoom(1);
        setPan({ x: 0, y: 0 });
        const next: Record<string, { auto: boolean; min: number; max: number }> = {};
        selectedCurves.forEach((name) => {
          const vals = data[name];
          const valid = vals ? (vals.filter((v) => v != null && Number.isFinite(v)) as number[]) : [];
          const dataMin = valid.length ? Math.min(...valid) : 0;
          const dataMax = valid.length ? Math.max(...valid) : 1;
          next[name] = { auto: true, min: dataMin, max: dataMax };
        });
        setCurveScales(next);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load data"))
      .finally(() => setLoadingChart(false));
  }, [wellId, selectedCurves, depthMin, depthMax]);

  const filteredCurveNames = curveSearch.trim()
    ? curveNames.filter((name) => name.toLowerCase().includes(curveSearch.trim().toLowerCase()))
    : curveNames;

  const toggleCurve = (name: string) => {
    setSelectedCurves((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!chartContainerRef.current) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.max(0.2, Math.min(5, z + delta)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning.current) return;
    setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
  };

  const handleMouseUp = () => {
    isPanning.current = false;
  };

  const handleMouseLeave = () => {
    isPanning.current = false;
  };

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(5, z + 0.25));
  }, []);
  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(0.2, z - 0.25));
  }, []);
  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const setCurveScale = useCallback((name: string, patch: Partial<{ auto: boolean; min: number; max: number }>) => {
    setCurveScales((prev) => {
      const cur = prev[name] ?? { auto: true, min: 0, max: 1 };
      return { ...prev, [name]: { ...cur, ...patch } };
    });
  }, []);

  const err = error || wellError;
  if (loading) {
    return <TabLoaderFull message="Loading curves and depth range..." />;
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
      {/* Left: graph */}
      <div className="flex-1 min-w-0 flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center flex-wrap gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
          <span className="font-medium text-slate-700 mr-1">Chart</span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={zoomIn}
              disabled={!chartData}
              className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={zoomOut}
              disabled={!chartData}
              className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="min-w-[3rem] text-center text-slate-500 tabular-nums" title="Zoom level">
              {Math.round(zoom * 100)}%
            </span>
          </div>
          <button
            type="button"
            onClick={resetView}
            disabled={!chartData}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Reset zoom and pan (fit view)"
          >
            <Maximize2 className="w-4 h-4" />
            <span>Fit view</span>
          </button>
          <span className="text-slate-400">|</span>
          <ZoomIn className="w-4 h-4" />
          <span>Scroll to zoom</span>
          <Move className="w-4 h-4 ml-2" />
          <span>Drag to pan</span>
        </div>
        <div className="relative flex-1 min-h-[400px] overflow-hidden">
          {loadingChart && <TabLoaderOverlay message="Loading chart..." />}
          <div
            ref={chartContainerRef}
            className="h-full overflow-hidden bg-slate-900/5 cursor-grab active:cursor-grabbing"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            style={{ touchAction: "none" }}
          >
            {chartData && (
              <WellLogChart
                data={chartData}
                curveNames={selectedCurves}
                curveScales={curveScales}
                zoom={zoom}
                pan={pan}
              />
            )}
            {!chartData && !loadingChart && (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                Select curves and depth range, then click Load chart
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: selection */}
      <div className="w-72 shrink-0 pl-4 flex flex-col">
        <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">{wellName} – Well log analysis</h3>
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
              <div className="flex flex-col gap-1.5 max-h-35 overflow-y-auto">
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
                      <span>{highlightMatch(name, curveSearch)}</span>
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
                  title="Minimum depth for chart"
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
                  title="Maximum depth for chart"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={loadChart}
              disabled={loadingChart || selectedCurves.length === 0}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              title="Load chart with selected curves and depth range"
            >
              {loadingChart ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Load chart
            </button>
            {chartData && selectedCurves.length > 0 && (
              <div className="border-t border-slate-200 pt-4 mt-4">
                <h4 className="text-xs font-semibold text-slate-600 mb-2" title="Set min/max scale per curve">
                  Scale per curve
                </h4>
                <div className="space-y-3 max-h-48 overflow-y-auto">
                  {selectedCurves.map((name) => {
                    const scale = curveScales[name] ?? { auto: true, min: 0, max: 1 };
                    return (
                      <div key={name} className="rounded border border-slate-200 p-2 bg-slate-50/80">
                        <div className="flex items-center gap-2 mb-1.5">
                          <input
                            type="checkbox"
                            id={`scale-auto-${name}`}
                            checked={scale.auto}
                            onChange={(e) => setCurveScale(name, { auto: e.target.checked })}
                            className="rounded border-slate-300"
                            title="Auto scale from data"
                          />
                          <label htmlFor={`scale-auto-${name}`} className="text-xs font-medium text-slate-700 truncate flex-1">
                            {name}
                          </label>
                        </div>
                        <div className="flex gap-1.5">
                          <div className="flex-1">
                            <label className="sr-only">Min</label>
                            <input
                              type="number"
                              value={scale.min}
                              onChange={(e) => setCurveScale(name, { min: parseFloat(e.target.value) || 0 })}
                              disabled={scale.auto}
                              step="any"
                              className="w-full px-1.5 py-1 border border-slate-300 rounded text-xs disabled:bg-slate-100 disabled:text-slate-400"
                              title={`Min value for ${name}`}
                            />
                          </div>
                          <div className="flex-1">
                            <label className="sr-only">Max</label>
                            <input
                              type="number"
                              value={scale.max}
                              onChange={(e) => setCurveScale(name, { max: parseFloat(e.target.value) || 1 })}
                              disabled={scale.auto}
                              step="any"
                              className="w-full px-1.5 py-1 border border-slate-300 rounded text-xs disabled:bg-slate-100 disabled:text-slate-400"
                              title={`Max value for ${name}`}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {err && <p className="text-red-600 text-sm mt-2">{err}</p>}
        </div>
      </div>
    </div>
  );
}

interface WellLogChartProps {
  data: { depth: number[]; [key: string]: number[] };
  curveNames: string[];
  curveScales: Record<string, { auto: boolean; min: number; max: number }>;
  zoom: number;
  pan: { x: number; y: number };
}

function WellLogChart({ data, curveNames, curveScales, zoom, pan }: WellLogChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };

  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: Math.max(100, width), h: Math.max(200, height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const depth = data.depth;
  if (!depth || depth.length === 0) return null;

  const depthMin = Math.min(...depth);
  const depthMax = Math.max(...depth);
  const chartW = size.w - padding.left - padding.right;
  const chartH = size.h - padding.top - padding.bottom;
  const numTracks = curveNames.length || 1;
  const trackW = chartW / numTracks;

  const yScale = (d: number) => {
    const range = depthMax - depthMin || 1;
    return padding.top + chartH - ((d - depthMin) / range) * chartH;
  };

  const curvesWithScales = curveNames.map((name, i) => {
    const vals = data[name];
    const valid = vals ? (vals.filter((v) => v != null && Number.isFinite(v)) as number[]) : [];
    const dataMin = valid.length ? Math.min(...valid) : 0;
    const dataMax = valid.length ? Math.max(...valid) : 1;
    const scaleCfg = curveScales[name];
    const useManual = scaleCfg && !scaleCfg.auto;
    const min = useManual ? scaleCfg.min : dataMin;
    const max = useManual ? scaleCfg.max : dataMax;
    const range = max - min || 1;
    const trackLeft = padding.left + i * trackW;
    const xScale = (v: number) => trackLeft + ((v - min) / range) * trackW;
    return {
      name,
      color: CURVE_COLORS[i % CURVE_COLORS.length],
      min,
      max,
      trackLeft,
      trackW,
      xScale,
      values: data[name],
    };
  });

  return (
    <svg
      ref={svgRef}
      width={size.w}
      height={size.h}
      className="block"
      style={{
        transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
        transformOrigin: "center center",
      }}
    >
      {/* Horizontal grid (depth) */}
      {[0.25, 0.5, 0.75].map((t) => (
        <line
          key={`h-${t}`}
          x1={padding.left}
          y1={padding.top + (1 - t) * chartH}
          x2={padding.left + chartW}
          y2={padding.top + (1 - t) * chartH}
          stroke="#e2e8f0"
          strokeWidth="0.5"
        />
      ))}
      {/* Vertical track separators */}
      {curvesWithScales.map((c, i) =>
        i > 0 ? (
          <line
            key={`v-${c.name}`}
            x1={c.trackLeft}
            y1={padding.top}
            x2={c.trackLeft}
            y2={padding.top + chartH}
            stroke="#cbd5e1"
            strokeWidth="1"
          />
        ) : null
      )}
      {/* Depth axis */}
      {[depthMin, (depthMin + depthMax) / 2, depthMax].map((d) => (
        <text
          key={d}
          x={padding.left - 8}
          y={yScale(d)}
          textAnchor="end"
          dominantBaseline="middle"
          className="fill-slate-600 text-xs"
        >
          {d.toFixed(1)}
        </text>
      ))}
      <text x={padding.left - 8} y={size.h - 12} textAnchor="end" className="fill-slate-500 text-xs">
        Depth
      </text>
      {/* Curve tracks */}
      {curvesWithScales.map(({ name, color, xScale, values, trackLeft, trackW, min, max }) => {
        const points = depth
          .map((d, i) => {
            const v = values?.[i];
            if (v == null || !Number.isFinite(v)) return null;
            return `${xScale(v)},${yScale(d)}`;
          })
          .filter(Boolean) as string[];
        if (points.length < 2) return null;
        const pathD = `M ${points.join(" L ")}`;
        return (
          <g key={name}>
            <path
              d={pathD}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Track label */}
            <text
              x={trackLeft + trackW / 2}
              y={padding.top - 8}
              textAnchor="middle"
              className="fill-slate-600 text-xs font-medium"
            >
              {name}
            </text>
            <text
              x={trackLeft + 4}
              y={padding.top + 12}
              className="fill-slate-400 text-[10px]"
            >
              {min.toFixed(2)}
            </text>
            <text
              x={trackLeft + trackW - 4}
              y={padding.top + 12}
              textAnchor="end"
              className="fill-slate-400 text-[10px]"
            >
              {max.toFixed(2)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
