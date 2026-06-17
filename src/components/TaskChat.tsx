'use client';

import { useEffect, useRef, useState } from 'react';
import GuitoWalker from './GuitoWalker';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string | Date;
}

/** Chat de IA específico de una tarea; habla con `/api/tasks/[id]/chat` para destrabarla. */
export default function TaskChat({ taskId }: { taskId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingHistory(true);
      try {
        const res = await fetch(`/api/tasks/${taskId}/chat`);
        const data = (await res.json()) as Message[];
        if (!cancelled) setMessages(data);
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error');
      setMessages((m) => [...m, data.userMsg, data.assistantMsg]);
    } catch (e) {
      setError((e as Error).message);
      setInput(text);
    } finally {
      setLoading(false);
    }
  }

  const walking = input.trim().length > 0 || loading;

  return (
    <div className="flex flex-col h-full">
      <GuitoWalker walking={walking} />
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {loadingHistory ? (
          <p className="text-xs mono text-[var(--muted)]">cargando conversación…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Brainstorm con la IA sobre esta tarea. Pregunta cómo abordarla, pide pasos, identifica riesgos. La conversación se guarda — puedes volver luego.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--surface)] border border-[var(--border)]'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {loading && <div className="text-xs mono text-[var(--muted)]">pensando…</div>}
        {error && <div className="text-xs mono text-[var(--danger)]">{error}</div>}
      </div>

      <div className="border-t border-[var(--border)] p-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="¿Cómo abordo esto? ¿Qué pasos seguir?…"
          disabled={loading}
          className="flex-1 bg-[var(--surface)] border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--accent)] disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-white px-4 disabled:opacity-50"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
