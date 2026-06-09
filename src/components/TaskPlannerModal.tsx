'use client';

import { useEffect, useRef, useState } from 'react';
import type { Task } from '@/lib/types';
import type { ChatMessage, PlannerResult, TaskDraft } from '@/lib/groq-planner';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (tasks: Task[]) => void;
}

type Proposal =
  | { kind: 'single'; draft: TaskDraft }
  | { kind: 'multi'; parent: TaskDraft; subtasks: TaskDraft[] };

export default function TaskPlannerModal({ open, onClose, onCreated }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setMessages([]);
      setProposal(null);
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
      if (data.action === 'propose') {
        setProposal({ kind: 'single', draft: data.draft });
      } else if (data.action === 'propose_multi') {
        setProposal({ kind: 'multi', parent: data.parent, subtasks: data.subtasks });
      } else {
        setProposal(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function draftToBody(d: TaskDraft, parent_id: string | null = null) {
    return {
      title: d.title,
      description: d.description,
      priority: d.priority,
      due_date: d.due_date,
      deadline: d.deadline,
      parent_id,
      tags: d.estimated_hours ? [`~${d.estimated_hours}h`] : [],
    };
  }

  async function postOne(body: object): Promise<Task> {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const task = await res.json();
    if (!res.ok) throw new Error((task as { error: string }).error ?? 'Error creando tarea');
    return task as Task;
  }

  async function createAll() {
    if (!proposal) return;
    setLoading(true);
    setError(null);
    try {
      if (proposal.kind === 'single') {
        const t = await postOne(draftToBody(proposal.draft));
        onCreated([t]);
      } else {
        const parent = await postOne(draftToBody(proposal.parent));
        const subs: Task[] = [];
        for (const s of proposal.subtasks) {
          subs.push(await postOne(draftToBody(s, parent.id)));
        }
        onCreated([parent, ...subs]);
      }
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
              Describe la tarea con tus palabras. La IA confirma lo que entendió y propone fecha y tiempo estimado. Si la tarea es grande, te propondrá <strong>dividirla en subtareas</strong>.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
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
          ))}
          {loading && (
            <div className="text-xs text-[var(--muted)] mono">pensando…</div>
          )}
          {error && (
            <div className="text-xs text-[var(--danger)] mono">{error}</div>
          )}
        </div>

        {proposal && (
          <div className="border-t border-[var(--border)] bg-[var(--surface)] p-4 space-y-3 max-h-[40vh] overflow-y-auto">
            {proposal.kind === 'single' ? (
              <DraftPreview label="Borrador propuesto" draft={proposal.draft} />
            ) : (
              <>
                <DraftPreview
                  label={`Tarea principal (con ${proposal.subtasks.length} subtareas)`}
                  draft={proposal.parent}
                />
                <div className="pl-3 border-l-2 border-[var(--accent)] space-y-2">
                  {proposal.subtasks.map((s, i) => (
                    <DraftPreview key={i} label={`↳ Subtarea ${i + 1}`} draft={s} compact />
                  ))}
                </div>
              </>
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={createAll}
                disabled={loading}
                className="bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-white px-4 py-1.5 text-sm disabled:opacity-50"
              >
                {proposal.kind === 'multi'
                  ? `Crear ${1 + proposal.subtasks.length} tareas`
                  : 'Crear tarea'}
              </button>
              <button
                onClick={() => setProposal(null)}
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
            placeholder={proposal ? 'Pide cambios o confirma…' : 'Describe la tarea…'}
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

function DraftPreview({
  label,
  draft,
  compact = false,
}: {
  label: string;
  draft: TaskDraft;
  compact?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-[var(--muted)] mono">{label}</div>
      <div className={compact ? 'text-sm font-medium' : 'font-medium'}>{draft.title}</div>
      {draft.description && !compact && (
        <div className="text-sm text-[var(--muted)]">{draft.description}</div>
      )}
      <div className="flex gap-3 text-xs mono text-[var(--muted)] flex-wrap mt-1">
        <span>prio: {draft.priority}</span>
        {draft.due_date && <span>vence: {draft.due_date}</span>}
        {draft.deadline && <span>límite: {draft.deadline}</span>}
        {draft.estimated_hours != null && <span>~{draft.estimated_hours}h</span>}
      </div>
    </div>
  );
}
