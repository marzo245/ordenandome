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
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function insertAtCursor(text: string) {
    const el = inputRef.current;
    if (!el) {
      setInput((v) => v + text);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setInput((v) => v.slice(0, start) + text + v.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function uploadImage(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/notes/upload-image', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'upload failed');
      insertAtCursor(`![${data.alt || 'imagen'}](${data.url})\n`);
    } catch (e) {
      setError(`Imagen: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const img = Array.from(e.clipboardData.items).find((it) => it.type.startsWith('image/'));
    if (!img) return;
    const f = img.getAsFile();
    if (!f) return;
    e.preventDefault();
    uploadImage(f);
  }

  function onDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    for (const f of files) uploadImage(f);
  }

  // Al cerrar NO borramos el estado: así, si cierras sin querer (click fuera),
  // se conserva lo que escribiste y la conversación. Se limpia solo tras crear
  // la tarea con éxito o con el botón "nueva conversación".
  function resetConversation() {
    setMessages([]);
    setProposal(null);
    setInput('');
    setError(null);
  }

  // Enfoca el textarea al abrir (el componente permanece montado entre aperturas).
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
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
      type: d.type,
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
      resetConversation();
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
        className="bg-[var(--bg)] border border-[var(--border)] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="font-semibold">Planear tarea con IA</h2>
          <div className="flex items-center gap-3">
            {messages.length > 0 && (
              <button
                onClick={resetConversation}
                disabled={loading}
                className="text-xs text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-50"
                title="Descartar esta conversación y empezar de cero"
              >
                nueva conversación
              </button>
            )}
            <button
              onClick={onClose}
              className="text-[var(--muted)] hover:text-[var(--danger)]"
              title="Cerrar (se conserva lo escrito)"
            >
              ×
            </button>
          </div>
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
                <div className="pl-3 border-l-2 border-[var(--border)] space-y-2">
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

        <div className="border-t border-[var(--border)] p-3 space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || loading}
              className="mono text-xs px-2 py-1 border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
              title="Adjuntar imagen"
            >
              {uploading ? 'subiendo…' : '🖼️ imagen'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadImage(f);
                e.target.value = '';
              }}
            />
            <span className="mono text-[10px] text-[var(--muted)]">
              pega o arrastra screenshots; la IA verá la URL
            </span>
          </div>
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={onPaste}
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={proposal ? 'Pide cambios o confirma… (⌘/Ctrl+Enter)' : 'Describe la tarea… (⌘/Ctrl+Enter)'}
              disabled={loading}
              rows={3}
              className="flex-1 bg-[var(--surface)] border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--accent)] disabled:opacity-50 resize-y text-sm"
              autoFocus
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-white px-4 disabled:opacity-50 self-stretch"
            >
              Enviar
            </button>
          </div>
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
