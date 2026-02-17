import { useState, useRef, useEffect } from "react";
import { sendChatMessage, type ChatMessage } from "../api/client";
import { MessageCircle, Send, Loader2, Trash2 } from "lucide-react";

interface ChatbotProps {
  wellName?: string;
}

export default function Chatbot({ wellName }: ChatbotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError(null);
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      const history: ChatMessage[] = [...messages, userMsg];
      const { reply } = await sendChatMessage(text, {
        history: history.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
        wellName: wellName ?? undefined,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get reply");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <div className="h-full flex flex-col min-h-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50/80">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Chatbot</h3>
            <p className="text-xs text-slate-500">
              Ask about well logs, curves, petrophysics{wellName ? ` · Well: ${wellName}` : ""}
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200"
            title="Clear conversation"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px]">
        {messages.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm text-center px-4">
            <MessageCircle className="w-10 h-10 mb-3 opacity-50" />
            <p>Ask anything about well logs, LAS files, curves (GR, density, resistivity), or petrophysics.</p>
            {wellName && (
              <p className="mt-1 text-xs">Context: well <strong className="text-slate-600">{wellName}</strong></p>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "bg-violet-600 text-white"
                  : "bg-slate-100 text-slate-800 border border-slate-200"
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-2.5 bg-slate-100 border border-slate-200 flex items-center gap-2 text-slate-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>Thinking…</span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-100 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="p-3 border-t border-slate-200 bg-slate-50/50">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Type your question…"
            className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            disabled={loading}
            title="Ask about well logs or petrophysics"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium text-sm flex items-center gap-2"
            title="Send message"
          >
            <Send className="w-4 h-4" />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
