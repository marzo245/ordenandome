'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { KoEntry, KoImportCaso } from '@/db';
import GuitoWalker from './GuitoWalker';
import type { KoAiResult, KoBulkEdit, KoDraft } from '@/lib/ko-ai';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  /** URLs de capturas que SÍ se mandaron a analizar (solo al pulsar «Analizar»). */
  images?: string[];
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB por imagen

/** Sube una imagen al host (imgbb→catbox) y devuelve su URL pública. */
async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/notes/upload-image', { method: 'POST', body: fd });
  const data = await res.json();
  if (!res.ok || !data.url) {
    throw new Error((data as { error?: string }).error ?? 'No se pudo subir la imagen');
  }
  return data.url as string;
}

/** Extrae las URLs de las imágenes markdown `![..](url)` presentes en un texto. */
function extractImageUrls(text: string): string[] {
  return [...text.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]);
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
  img: (p: object) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img className="max-h-48 rounded border border-[var(--border)] my-2" alt="" {...p} />
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
  'Pregunta por los KO existentes, pide categorizar varios a la vez, pega un error nuevo para crearlo, o pega una captura para incrustarla (y «Analizar» si quieres que la IA la lea).';

/**
 * Modal del asistente de IA de KO (GUITO en `/ko`). Conversa con `/api/ko/ai`,
 * renderiza las propuestas (crear/editar/edición masiva) y, al confirmar, hace
 * el POST/PATCH real resolviendo las entidades por nombre/código.
 */
export default function KoAiChat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [entries, setEntries] = useState<KoEntry[]>([]);
  // Cuentas pendientes (errores sin KO): para vincularlas al crear el KO desde el chat.
  const [pendientes, setPendientes] = useState<KoImportCaso[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<KoAiResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ¿Hay alguna imagen (link markdown) en lo que está escrito? Habilita «Analizar».
  const inputHasImages = extractImageUrls(input).length > 0;

  // Al cerrar NO borramos la conversación: solo se limpia tras aplicar con
  // éxito o con el botón "nueva conversación".
  function resetConversation() {
    setMessages([]);
    setInput('');
    setError(null);
    setProposal(null);
    setBulkStatus(null);
  }

  // Inserta texto en la posición del cursor del textarea (o al final).
  function insertAtCursor(snippet: string) {
    const ta = inputRef.current;
    setInput((prev) => {
      const start = ta?.selectionStart ?? prev.length;
      const end = ta?.selectionEnd ?? prev.length;
      const next = prev.slice(0, start) + snippet + prev.slice(end);
      requestAnimationFrame(() => {
        if (!ta) return;
        ta.focus();
        const pos = start + snippet.length;
        ta.setSelectionRange(pos, pos);
      });
      return next;
    });
  }

  // Sube cada captura y la inserta como link markdown en el cuadro de texto.
  // Por defecto NO se analiza: queda como imagen incrustada (como en markdown).
  async function addImages(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (list.length === 0) return;
    setError(null);
    for (const file of list) {
      if (file.size > MAX_IMAGE_BYTES) {
        setError(`"${file.name || 'imagen'}" supera 5MB.`);
        continue;
      }
      try {
        setUploading(true);
        const url = await uploadImage(file);
        insertAtCursor(`\n![captura](${url})\n`);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo subir la imagen.');
      } finally {
        setUploading(false);
      }
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const imgs = Array.from(e.clipboardData.files).filter((f) =>
      f.type.startsWith('image/'),
    );
    if (imgs.length > 0) {
      e.preventDefault();
      void addImages(imgs);
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
        const [resE, resP] = await Promise.all([
          fetch('/api/ko'),
          fetch('/api/ko/casos?tipo=desconocida'),
        ]);
        if (resE.ok) {
          const data = (await resE.json()) as KoEntry[];
          if (!cancelled && Array.isArray(data)) setEntries(data);
        }
        if (resP.ok) {
          const data = (await resP.json()) as KoImportCaso[];
          if (!cancelled && Array.isArray(data)) setPendientes(data);
        }
      } catch {
        /* silencioso: el chat sigue usable aunque falle el fetch de contexto */
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

  // analyze=false → texto plano (los links de imagen viajan como markdown, va a Groq).
  // analyze=true  → además manda las imágenes a la IA para que las lea (Gemini).
  async function send(analyze = false) {
    const text = input.trim();
    if (!text || loading) return;

    const imageUrls = analyze ? extractImageUrls(text) : [];
    const userMsg: ChatMessage = {
      role: 'user',
      content: text,
      ...(imageUrls.length ? { images: imageUrls } : {}),
    };
    const nextMessages: ChatMessage[] = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
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

  // Une las capturas que el usuario incrustó en la conversación (links markdown)
  // dentro de la documentación, sin duplicar las que el borrador ya incluya.
  function withConversationImages<T extends { documentacion?: string | null }>(body: T): T {
    const urls = [...new Set(messages.flatMap((m) => extractImageUrls(m.content)))];
    if (urls.length === 0) return body;
    const base = (body.documentacion ?? '').trim();
    const faltantes = urls.filter((u) => !base.includes(u));
    if (faltantes.length === 0) return body;
    const embeds = faltantes.map((u, i) => `![captura ${i + 1}](${u})`).join('\n');
    return { ...body, documentacion: base ? `${base}\n\n${embeds}` : embeds };
  }

  // Cuentas pendientes cuyo "Error normalizado" coincide con el error que la IA dice resolver.
  function pendingMatch(errorTexto: string | null | undefined): KoImportCaso[] {
    if (!errorTexto) return [];
    const t = errorTexto.trim().toLowerCase();
    if (!t) return [];
    return pendientes.filter((c) => (c.error_texto ?? '').trim().toLowerCase() === t);
  }

  /**
   * Confirma un `propose_create`. Si la IA marcó un `pendienteError` que cruza con
   * cuentas pendientes, crea el KO y las vincula de una vez (promover); si no,
   * crea el KO normal. Incrusta las capturas de la conversación en documentación.
   */
  async function confirmCreate(draft: KoDraft, pendienteError?: string | null) {
    const matches = pendingMatch(pendienteError);
    const body = withConversationImages(draftToBody(draft));
    setLoading(true);
    setError(null);
    try {
      const res =
        matches.length > 0
          ? await fetch('/api/ko/casos/promover', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                mode: 'create',
                koData: body,
                caso_ids: matches.map((c) => c.id),
              }),
            })
          : await fetch('/api/ko', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
      const data = await res.json();
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? `Falló (${res.status})`);
      }
      router.refresh();
      resetConversation();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear');
    } finally {
      setLoading(false);
    }
  }

  async function createFrom(body: { documentacion?: string | null } & Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ko', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withConversationImages(body)),
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
        <GuitoWalker walking={input.trim().length > 0 || loading} />

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
                  (() => {
                    const imgs = extractImageUrls(m.content);
                    const textOnly = imgs.length
                      ? m.content.replace(/!\[[^\]]*\]\([^)\s]+\)/g, '').replace(/\n{2,}/g, '\n').trim()
                      : m.content;
                    return (
                      <>
                        {imgs.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-1.5">
                            {imgs.map((src, j) => (
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
                        {textOnly}
                      </>
                    );
                  })()
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
          (() => {
            const vinculadas = pendingMatch(proposal.pendienteError).length;
            return (
          <ProposalBox>
            <CreatePreview draft={proposal.draft} />
            {vinculadas > 0 && (
              <p className="text-xs text-[var(--accent)]">
                Se vincularán {vinculadas} cuenta{vinculadas === 1 ? '' : 's'} pendiente
                {vinculadas === 1 ? '' : 's'} a este KO.
              </p>
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => confirmCreate(proposal.draft, proposal.pendienteError)}
                disabled={loading}
                className="bg-[var(--accent)] text-white rounded px-4 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
              >
                {vinculadas > 0 ? 'Crear KO y vincular' : 'Crear KO'}
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
          {uploading && (
            <div className="text-xs text-[var(--muted)] mono mb-2">subiendo captura…</div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addImages(e.target.files);
              e.target.value = '';
            }}
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={loading || uploading}
              title="Adjuntar captura como imagen (o pega con Ctrl/⌘+V)"
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
              placeholder="Describe o pega el error. Pega una captura para incrustarla; usa «Analizar» si quieres que la IA la lea. (⌘/Ctrl+Enter)"
              disabled={loading}
              rows={3}
              className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded px-3 py-2 outline-none focus:border-[var(--accent)] disabled:opacity-50 resize-y text-sm"
              autoFocus
            />
            <div className="flex flex-col gap-2">
              <button
                onClick={() => send(false)}
                disabled={loading || !input.trim()}
                className="bg-[var(--accent)] text-white rounded px-4 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
              >
                Enviar
              </button>
              <button
                onClick={() => send(true)}
                disabled={loading || !inputHasImages}
                title={
                  inputHasImages
                    ? 'Mandar la(s) captura(s) a la IA para que las lea (usa Gemini)'
                    : 'Pega o adjunta una captura para poder analizarla'
                }
                className="border border-[var(--border)] rounded px-4 py-1.5 text-sm hover:bg-[var(--surface-hover)] disabled:opacity-50"
              >
                Analizar
              </button>
            </div>
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
