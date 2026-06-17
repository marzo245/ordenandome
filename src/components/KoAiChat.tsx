'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { KoEntry } from '@/db';
import GuitoWalker from './GuitoWalker';
import type { KoAiResult, KoBulkEdit, KoDraft } from '@/lib/ko-ai';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  images?: string[]; // data URLs base64 de capturas adjuntas
};

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB por imagen

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------------------------------------ */
/* Markdown rendering (mismo patrón que KoManager / DailySummary)      */
/* ------------------------------------------------------------------ */

const MD_COMPONENTS = {
  h1: (p: object) => <h3 className="font-semibold text-[var(--text)] mt-3 mb-1" {...p} />,
  h2: (p: object) => <h3 className="font-semibold text-[var(--text)] mt-3 mb-1" {...p} />,
  h3: (p: object) => <h3 className="font-semibold text-[var(--text)] mt-3 mb-1" {...p} />,
  p: (p: object) => <p className="mb-2 last:mb-0" {...p} />,
  strong: (p: object) => <strong className="font-semibold text-[var(--text)]" {...p} />,
  em: (p: object) => <em className="italic text-[var(--muted)]" {...p} />,
  ul: (p: object) => <ul className="list-disc list-outside ml-5 space-y-0.5 mb-2" {...p} />,
  ol: (p: object) => <ol className="list-decimal list-outside ml-5 space-y-1 mb-2" {...p} />,
  li: (p: object) => <li className="text-[var(--text)]" {...p} />,
  a: (p: object) => (
    <a className="text-[var(--accent)] hover:underline" target="_blank" rel="noreferrer" {...p} />
  ),
  code: (p: object) => (
    <code
      className="mono text-xs bg-[var(--bg)] px-1 py-0.5 border border-[var(--border)]"
      {...p}
    />
  ),
  hr: () => <hr className="border-[var(--border)] my-3" />,
};

function AssistantMarkdown({ value }: { value: string }) {
  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
        {value}
      </ReactMarkdown>
    </div>
  );
}

const PLACEHOLDER =
  'Pregunta por los KO existentes, pide categorizar varios a la vez, pega un error nuevo para crearlo, o adjunta una captura del error como contexto.';

/**
 * Modal del asistente de IA de KO (GUITO en `/ko`). Conversa con `/api/ko/ai`,
 * renderiza las propuestas (crear/editar/edición masiva) y, al confirmar, hace
 * el POST/PATCH real resolviendo las entidades por nombre/código.
 */
export default function KoAiChat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [entries, setEntries] = useState<KoEntry[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<KoAiResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Al cerrar NO borramos la conversación: solo se limpia tras aplicar con
  // éxito o con el botón "nueva conversación".
  function resetConversation() {
    setMessages([]);
    setInput('');
    setError(null);
    setProposal(null);
    setBulkStatus(null);
    setAttachments([]);
  }

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (list.length === 0) return;
    setError(null);
    for (const file of list) {
      if (attachments.length >= MAX_IMAGES) {
        setError(`Máximo ${MAX_IMAGES} imágenes por mensaje.`);
        break;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setError(`"${file.name || 'imagen'}" supera 5MB.`);
        continue;
      }
      try {
        const dataUrl = await readFileAsDataURL(file);
        setAttachments((prev) =>
          prev.length >= MAX_IMAGES ? prev : [...prev, dataUrl],
        );
      } catch {
        setError('No se pudo leer la imagen.');
      }
    }
  }

  function removeAttachment(i: number) {
    setAttachments((prev) => prev.filter((_, j) => j !== i));
  }

  function onPaste(e: React.ClipboardEvent) {
    const imgs = Array.from(e.clipboardData.files).filter((f) =>
      f.type.startsWith('image/'),
    );
    if (imgs.length > 0) {
      e.preventDefault();
      void addFiles(imgs);
    }
  }

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Carga las entries por su cuenta cada vez que se abre el chat; se usan para
  // resolver targets en propose_edit/propose_bulk_edit.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/ko');
        if (!res.ok) return;
        const data = (await res.json()) as KoEntry[];
        if (!cancelled && Array.isArray(data)) setEntries(data);
      } catch {
        /* silencioso: el chat sigue usable aunque falle el fetch de targets */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || loading) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: text || (attachments.length ? '(captura adjunta)' : ''),
      ...(attachments.length ? { images: attachments } : {}),
    };
    const nextMessages: ChatMessage[] = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setAttachments([]);
    setLoading(true);
    setError(null);
    setProposal(null);
    setBulkStatus(null);

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
      if (
        data.action === 'propose_create' ||
        data.action === 'propose_edit' ||
        data.action === 'propose_bulk_edit'
      ) {
        setProposal(data);
      } else {
        // clarify y answer son solo lectura: no dejan proposal pendiente.
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
      router.refresh();
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
      router.refresh();
      resetConversation();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al aplicar');
    } finally {
      setLoading(false);
    }
  }

  async function applyBulk(edits: KoBulkEdit[]) {
    setBusy(true);
    setError(null);
    setBulkStatus(null);
    let ok = 0;
    let failed = 0;
    for (const edit of edits) {
      try {
        const res = await fetch(`/api/ko/${edit.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(edit.patch),
        });
        const data = await res.json();
        if (!res.ok) throw new Error((data as { error?: string }).error ?? `PATCH falló (${res.status})`);
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    setBusy(false);
    if (ok > 0) router.refresh();
    if (failed === 0) {
      // Todos aplicados: limpiamos la conversación y cerramos.
      resetConversation();
      onClose();
    } else {
      // Quedan fallos: dejamos el resumen y descartamos el proposal.
      setProposal(null);
      setBulkStatus(`✓ ${ok} aplicados · ${failed} fallaron`);
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

        {/* GUITO camina mientras escribes o la IA piensa */}
        <GuitoWalker walking={input.trim().length > 0 || attachments.length > 0 || loading} />

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-sm text-[var(--muted)]">{PLACEHOLDER}</p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] px-3 py-2 text-sm rounded-lg ${
                  m.role === 'user'
                    ? 'bg-[var(--accent)] text-white whitespace-pre-wrap'
                    : 'bg-[var(--surface)] border border-[var(--border)]'
                }`}
              >
                {m.role === 'assistant' ? (
                  <AssistantMarkdown value={m.content} />
                ) : (
                  <>
                    {m.images && m.images.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        {m.images.map((src, j) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={j}
                            src={src}
                            alt={`captura ${j + 1}`}
                            className="max-h-32 rounded border border-white/30 object-contain"
                          />
                        ))}
                      </div>
                    )}
                    {m.content}
                  </>
                )}
              </div>
            </div>
          ))}
          {loading && <div className="text-xs text-[var(--muted)] mono">pensando…</div>}
          {error && <div className="text-xs text-[var(--danger)] mono">{error}</div>}
          {bulkStatus && (
            <div className="text-xs text-[var(--muted)] mono">{bulkStatus}</div>
          )}
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

        {proposal && proposal.action === 'propose_bulk_edit' && (
          <ProposalBox>
            <div className="text-xs text-[var(--muted)] mono">
              {proposal.edits.length} {proposal.edits.length === 1 ? 'cambio' : 'cambios'}
            </div>
            <ul className="max-h-52 overflow-y-auto space-y-1.5">
              {proposal.edits.map((edit, i) => (
                <li key={edit.id ?? i} className="text-sm flex gap-2 items-baseline">
                  <span className="mono text-xs text-[var(--muted)] shrink-0">
                    {edit.codigo || 'sin código'}
                  </span>
                  <span className="text-[var(--muted)]">→</span>
                  <span className="text-[var(--text)] min-w-0 break-words">
                    {formatPatchInline(edit.patch)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => applyBulk(proposal.edits)}
                disabled={busy || loading}
                className="bg-[var(--accent)] text-white rounded px-4 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
              >
                {busy
                  ? 'Aplicando…'
                  : `Aplicar ${proposal.edits.length} ${proposal.edits.length === 1 ? 'cambio' : 'cambios'}`}
              </button>
              <button
                onClick={() => setProposal(null)}
                disabled={busy || loading}
                className="border border-[var(--border)] rounded px-4 py-1.5 text-sm hover:bg-[var(--surface-hover)] disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </ProposalBox>
        )}

        <div className="border-t border-[var(--border)] p-3">
          {/* Miniaturas de capturas adjuntas pendientes de enviar */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachments.map((src, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`adjunto ${i + 1}`}
                    className="h-16 w-16 object-cover rounded border border-[var(--border)]"
                  />
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="absolute -top-1.5 -right-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-full w-5 h-5 text-xs leading-none text-[var(--muted)] hover:text-[var(--danger)]"
                    title="Quitar imagen"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = '';
            }}
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={loading || attachments.length >= MAX_IMAGES}
              title="Adjuntar captura (o pega con Ctrl/⌘+V)"
              className="self-stretch px-3 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
            >
              📎
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Describe, pega el error o adjunta una captura… (⌘/Ctrl+Enter)"
              disabled={loading}
              rows={3}
              className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded px-3 py-2 outline-none focus:border-[var(--accent)] disabled:opacity-50 resize-y text-sm"
              autoFocus
            />
            <button
              onClick={send}
              disabled={loading || (!input.trim() && attachments.length === 0)}
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

function formatPatchInline(patch: Partial<KoDraft>): string {
  const keys = Object.keys(patch) as (keyof KoDraft)[];
  if (keys.length === 0) return 'sin cambios';
  return keys
    .map((k) => {
      const v = patch[k];
      let display: string;
      if (Array.isArray(v)) display = v.join(', ');
      else if (v == null || v === '') display = '—';
      else display = summarize(String(v));
      return `${PATCH_LABELS[k]}: ${display}`;
    })
    .join(', ');
}

function summarize(s: string): string {
  const trimmed = s.trim().replace(/\s+/g, ' ');
  return trimmed.length > 140 ? `${trimmed.slice(0, 140)}…` : trimmed;
}
