import { Loader2 } from "lucide-react";

interface TabLoaderProps {
  message?: string;
}

/** Full-height loader for initial tab data (e.g. loading curves). */
export function TabLoaderFull({ message = "Loading..." }: TabLoaderProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[320px] gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-slate-400" strokeWidth={2} />
      <p className="text-sm font-medium text-slate-500">{message}</p>
    </div>
  );
}

/** Overlay loader when an action is running (e.g. loading chart, running analysis). */
export function TabLoaderOverlay({ message = "Loading..." }: TabLoaderProps) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-[2px] rounded-lg">
      <Loader2 className="w-10 h-10 animate-spin text-slate-500" strokeWidth={2} />
      <p className="text-sm font-medium text-slate-600">{message}</p>
    </div>
  );
}
