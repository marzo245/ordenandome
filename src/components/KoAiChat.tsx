'use client';

import { useEffect, useRef, useState } from 'react';
import type { KoEntry } from '@/db';
import type { KoAiResult, KoDraft } from '@/lib/ko-ai';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

interface Props {
  open: boolean;
  onClose: () => void;
  entries: KoEntry[];
  onApplied: (entry: KoEntry) => void;
}

const PLACEHOLDER =
  'Pega un mensaje de error del sistema o describe un KO. La IA lo normaliza, lo clasifica y propone crearlo o editar uno existente.';

export default function KoAiChat({ open, onClose, entries, onApplied }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<KoAiResult | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Al cerrar NO borramos la conversación: solo se limpia tras aplicar con
  // éxito o con el botón "nueva conversación".
  function resetConversation() {
    setMessages([]);
    setInput('');
    setError(null);
    setProposal(null);
  }

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    setError(null);
    setProposal(null);

    try {
      const res = await fetch('/api/ko/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = (await res.json()) as KoAiResult | { error: string };
      if (!res.ok || 'error' in data) {
        throw new Error(('error' in data && data.error) || `Error (${res.status})`);
      }

      setMessages((m) => [...m, { role: 'assistant', content: data.message }]);
      if (data.action === 'propose_create' || data.action === 'propose_edit') {
        setProposal(data);
      } else {
        setProposal(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  }

  function draftToBody(d: KoDraft) {
    return {
      codigo: d.codigo,
      error: d.error,
      eco_notes: d.eco_notes,
      sistema: d.sistema,
      flujo: d.flujo,
      clasificacion: d.clasificacion,
      causa_raiz: d.causa_raiz,
      sistema_solucion: d.sistema_solucion,
      responsable: d.responsable,
      subprocesos: d.subprocesos ?? [],
      resolucion: d.resolucion,
      documentacion: d.documentacion,
    };
  }

  async function createFrom(body: object) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ko', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `POST falló (${res.status})`);
      onApplied(data as KoEntry);
      resetConversation();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear');
    } finally {
      setLoading(false);
    }
  }

  function resolveTarget(p: Extract<KoAiResult, { action: 'propose_edit' }>): KoEntry | null {
    if (p.targetCodigo) {
      const byCode = entries.find((e) => e.codigo === p.targetCodigo);
      if (byCode) return byCode;
    }
    return entries.find((e) => e.error === p.targetError) ?? null;
  }

  async function applyPatch(target: KoEntry, patch: Partial<KoDraft>) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ko/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `PATCH falló (${res.status})`);
      onApplied(data as KoEntry);
      resetConversation();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al aplicar');
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="font-semibold">Asistente de KO</h2>
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
            <p className="text-sm text-[var(--muted)]">{PLACEHOLDER}</p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] px-3 py-2 text-sm whitespace-pre-wrap rounded-lg ${
                  m.role === 'user'
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--surface)] border border-[var(--border)]'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && <div className="text-xs text-[var(--muted)] mono">pensando…</div>}
          {error && <div className="text-xs text-[var(--danger)] mono">{error}</div>}
        </div>

        {proposal && proposal.action === 'propose_create' && (
          <ProposalBox>
            <CreatePreview draft={proposal.draft} />
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => createFrom(draftToBody(proposal.draft))}
                disabled={loading}
                className="bg-[var(--accent)] text-white rounded px-4 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
              >
                Crear KO
              </button>
              <button
                onClick={() => setProposal(null)}
                disabled={loading}
                className="border border-[var(--border)] rounded px-4 py-1.5 text-sm hover:bg-[var(--surface-hover)] disabled:opacity-50"
              >
                Pedir cambios
              </button>
            </div>
          </ProposalBox>
        )}

        {proposal && proposal.action === 'propose_edit' && (
          (() => {
            const target = resolveTarget(proposal);
            if (!target) {
              return (
                <ProposalBox>
                  <p className="text-sm text-[var(--text)]">
                    No encontré ese KO; ¿quieres crearlo?
                  </p>
                  <CreatePreview draft={patchToDraft(proposal.patch, proposal.targetError)} />
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() =>
                        createFrom(
                          draftToBody(patchToDraft(proposal.patch, proposal.targetError)),
                        )
                      }
                      disabled={loading}
                      className="bg-[var(--accent)] text-white rounded px-4 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
                    >
                      Crear KO
                    </button>
                    <button
                      onClick={() => setProposal(null)}
                      disabled={loading}
                      className="border border-[var(--border)] rounded px-4 py-1.5 text-sm hover:bg-[var(--surface-hover)] disabled:opacity-50"
                    >
                      Pedir cambios
                    </button>
                  </div>
                </ProposalBox>
              );
            }
            return (
              <ProposalBox>
                <div className="text-xs text-[var(--muted)] mono">
                  Editar {target.codigo || 'sin código'} — {target.error}
                </div>
                <PatchPreview patch={proposal.patch} />
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => applyPatch(target, proposal.patch)}
                    disabled={loading}
                    className="bg-[var(--accent)] text-white rounded px-4 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
                  >
                    Aplicar cambios
                  </button>
                  <button
                    onClick={() => setProposal(null)}
                    disabled={loading}
                    className="border border-[var(--border)] rounded px-4 py-1.5 text-sm hover:bg-[var(--surface-hover)] disabled:opacity-50"
                  >
                    Pedir cambios
                  </button>
                </div>
              </ProposalBox>
            );
          })()
        )}

        <div className="border-t border-[var(--border)] p-3">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Describe o pega el error… (⌘/Ctrl+Enter)"
              disabled={loading}
              rows={3}
              className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded px-3 py-2 outline-none focus:border-[var(--accent)] disabled:opacity-50 resize-y text-sm"
              autoFocus
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="bg-[var(--accent)] text-white rounded px-4 hover:opacity-90 disabled:opacity-50 self-stretch"
            >
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function patchToDraft(patch: Partial<KoDraft>, fallbackError: string): KoDraft {
  return {
    codigo: patch.codigo ?? null,
    error: patch.error ?? fallbackError,
    eco_notes: patch.eco_notes ?? null,
    sistema: patch.sistema ?? null,
    flujo: patch.flujo ?? null,
    clasificacion: patch.clasificacion ?? null,
    causa_raiz: patch.causa_raiz ?? null,
    sistema_solucion: patch.sistema_solucion ?? null,
    responsable: patch.responsable ?? null,
    subprocesos: patch.subprocesos ?? [],
    resolucion: patch.resolucion ?? null,
    documentacion: patch.documentacion ?? null,
  };
}

function ProposalBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-[var(--border)] bg-[var(--surface)] p-4 space-y-2 max-h-[40vh] overflow-y-auto">
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-[11px] uppercase tracking-wider text-[var(--muted)] shrink-0 w-28 pt-0.5">
        {label}
      </span>
      <span className="text-[var(--text)] min-w-0 break-words">{value}</span>
    </div>
  );
}

function CreatePreview({ draft }: { draft: KoDraft }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-[var(--muted)] mono">Borrador propuesto</div>
      <Field label="Código" value={draft.codigo} />
      <Field label="Error" value={<span className="font-medium">{draft.error}</span>} />
      <Field label="Sistema" value={draft.sistema} />
      <Field label="Flujo" value={draft.flujo != null ? String(draft.flujo) : null} />
      <Field label="Clasificación" value={draft.clasificacion} />
      <Field label="Causa raíz" value={draft.causa_raiz} />
      <Field label="Resuelve en" value={draft.sistema_solucion} />
      <Field
        label="Subprocesos"
        value={draft.subprocesos?.length ? draft.subprocesos.join(', ') : null}
      />
      {draft.resolucion && (
        <Field label="Resolución" value={<span className="text-[var(--muted)]">{summarize(draft.resolucion)}</span>} />
      )}
      {draft.documentacion && (
        <Field
          label="Documentación"
          value={<span className="text-[var(--muted)]">{summarize(draft.documentacion)}</span>}
        />
      )}
    </div>
  );
}

const PATCH_LABELS: Record<keyof KoDraft, string> = {
  codigo: 'Código',
  error: 'Error',
  eco_notes: 'ECO Notes',
  sistema: 'Sistema',
  flujo: 'Flujo',
  clasificacion: 'Clasificación',
  causa_raiz: 'Causa raíz',
  sistema_solucion: 'Resuelve en',
  responsable: 'Responsable',
  subprocesos: 'Subprocesos',
  resolucion: 'Resolución',
  documentacion: 'Documentación',
};

function PatchPreview({ patch }: { patch: Partial<KoDraft> }) {
  const keys = Object.keys(patch) as (keyof KoDraft)[];
  if (keys.length === 0) {
    return <p className="text-sm text-[var(--muted)]">Sin cambios propuestos.</p>;
  }
  return (
    <div className="space-y-1">
      <div className="text-xs text-[var(--muted)] mono">Cambios propuestos</div>
      {keys.map((k) => {
        const v = patch[k];
        let display: string;
        if (Array.isArray(v)) display = v.join(', ');
        else if (v == null || v === '') display = '—';
        else display = summarize(String(v));
        return <Field key={k} label={PATCH_LABELS[k]} value={display} />;
      })}
    </div>
  );
}

function summarize(s: string): string {
  const trimmed = s.trim().replace(/\s+/g, ' ');
  return trimmed.length > 140 ? `${trimmed.slice(0, 140)}…` : trimmed;
}
