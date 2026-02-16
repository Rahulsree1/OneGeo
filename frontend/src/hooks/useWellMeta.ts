import { useState, useEffect } from "react";
import { getWellCurveNames, getWellDepthRange } from "../api/client";

type Cached = {
  curveNames: string[];
  depthRange: { min: number; max: number } | null;
};

const cache: Record<number, Cached> = {};

export function useWellMeta(wellId: number) {
  const cached = cache[wellId];
  const [curveNames, setCurveNames] = useState<string[]>(cached?.curveNames ?? []);
  const [depthRange, setDepthRange] = useState<{ min: number; max: number } | null>(
    cached?.depthRange ?? null
  );
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existing = cache[wellId];
    if (existing) {
      setCurveNames(existing.curveNames);
      setDepthRange(existing.depthRange);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getWellCurveNames(wellId), getWellDepthRange(wellId)])
      .then(([names, range]) => {
        if (cancelled) return;
        const dr = range ? { min: range.depth_min, max: range.depth_max } : null;
        cache[wellId] = { curveNames: names, depthRange: dr };
        setCurveNames(names);
        setDepthRange(dr);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wellId]);

  return { curveNames, depthRange, loading, error };
}
