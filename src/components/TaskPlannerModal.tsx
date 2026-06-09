'use client';

import { useEffect, useRef, useState } from 'react';
import type { Task } from '@/lib/types';
import type { ChatMessage, PlannerResult, TaskDraft } from '@/lib/groq-planner';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (task: Task) => void;
}

export default function TaskPlannerModal({ open, onClose, onCreated }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setMessages([]);
      setDraft(null);
      setInput('');
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = (await res.json()) as PlannerResult | { error: string };
      if ('error' in data) throw new Error(data.error);

      setMessages((m) => [...m, { role: 'assistant', content: data.message }]);
      if (data.action === 'propose') setDraft(data.draft);
      else setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function createTask() {
    if (!draft) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title,
          description: draft.description,
          priority: draft.priority,
          due_date: draft.due_date,
          tags: draft.estimated_hours ? [`~${draft.estimated_hours}h`] : [],
        }),
      });
      const task = (await res.json()) as Task;
      if (!res.ok) throw new Error((task as unknown as { error: string }).error);
      onCreated(task);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg)] border border-[var(--border)] w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="font-semibold">Planear tarea con IA</h2>
          <button
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--danger)]"
          >
            ×
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-sm text-[var(--muted)]">
              Describe la tarea con tus palabras. Ej: <em>&ldquo;Tengo que entregar el informe de bases de datos para revisión del profe&rdquo;</em>. La IA te confirmará lo que entendió y propondrá fecha y tiempo estimado en función de tus tareas actuales.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--surface)] border border-[var(--border)]'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="text-xs text-[var(--muted)] mono">pensando…</div>
          )}
          {error && (
            <div className="text-xs text-[var(--danger)] mono">{error}</div>
          )}
        </div>

        {draft && (
          <div className="border-t border-[var(--border)] bg-[var(--surface)] p-4 space-y-2">
            <div className="text-xs text-[var(--muted)] mono">Borrador propuesto</div>
            <div className="font-medium">{draft.title}</div>
            {draft.description && (
              <div className="text-sm text-[var(--muted)]">{draft.description}</div>
            )}
            <div className="flex gap-3 text-xs mono text-[var(--muted)] flex-wrap">
              <span>prioridad: {draft.priority}</span>
              {draft.due_date && <span>vence: {draft.due_date}</span>}
              {draft.estimated_hours != null && (
                <span>estimado: ~{draft.estimated_hours}h</span>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={createTask}
                disabled={loading}
                className="bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-white px-4 py-1.5 text-sm disabled:opacity-50"
              >
                Crear tarea
              </button>
              <button
                onClick={() => setDraft(null)}
                className="border border-[var(--border)] px-4 py-1.5 text-sm hover:bg-[var(--surface)]"
              >
                Pedir cambios
              </button>
            </div>
          </div>
        )}

        <div className="border-t border-[var(--border)] p-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder={draft ? 'Pide cambios o confirma…' : 'Describe la tarea…'}
            disabled={loading}
            className="flex-1 bg-[var(--surface)] border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--accent)] disabled:opacity-50"
            autoFocus
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
    </div>
  );
}
