'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AccionPaso, Sistema, SistemaSeccion } from '@/db';
import GuitoWalker from './GuitoWalker';
import type {
  AccionDraft,
  AccionDraftPaso,
  SistemaAiResult,
  SistemaDraft,
} from '@/lib/sistemas-ai';

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
/* Markdown rendering (mismo patrón que KoAiChat / SistemasManager)    */
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
  'Pregunta por los sistemas (OPERA, eCO, Salesforce, ForceBeat, Beats, SAP), documenta uno nuevo, crea o edita acciones. Pega una captura para incrustarla; usa «Analizar» si quieres que la IA la lea.';

/**
 * Modal del asistente de IA de Sistemas (GUITO en `/sistemas`). Chat multimodal
 * (permite adjuntar capturas) contra `/api/sistemas/ai`; renderiza propuestas de
 * crear/editar sistemas y acciones y las aplica al confirmar.
 */
export default function SistemasAiChat({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [sistemas, setSistemas] = useState<Sistema[]>([]);
  const [acciones, setAcciones] = useState<SistemaSeccion[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<SistemaAiResult | null>(null);
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

  // Al abrir, cargamos el contexto de sistemas (no llega por props).
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
    let cancelled = false;
    (async () => {
      try {
        const [sRes, aRes] = await Promise.all([
          fetch('/api/sistemas'),
          fetch('/api/sistemas/secciones'),
        ]);
        if (sRes.ok) {
          const data = (await sRes.json()) as Sistema[];
          if (!cancelled && Array.isArray(data)) setSistemas(data);
        }
        if (aRes.ok) {
          const data = (await aRes.json()) as SistemaSeccion[];
          if (!cancelled && Array.isArray(data)) setAcciones(data);
        }
      } catch {
        /* el contexto es opcional para resolver propose_edit/edit_accion */
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

    try {
      const res = await fetch('/api/sistemas/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = (await res.json()) as SistemaAiResult | { error: string };
      if (!res.ok || 'error' in data) {
        throw new Error(('error' in data && data.error) || `Error (${res.status})`);
      }

      setMessages((m) => [...m, { role: 'assistant', content: data.message }]);
      if (
        data.action === 'propose_create' ||
        data.action === 'propose_edit' ||
        data.action === 'propose_create_accion' ||
        data.action === 'propose_edit_accion'
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

  function draftToBody(d: SistemaDraft) {
    return {
      nombre: d.nombre,
      descripcion: d.descripcion,
      rol: d.rol,
      url: d.url,
      contenido: d.contenido,
    };
  }

  // Une las capturas que el usuario incrustó en la conversación (links markdown)
  // dentro del contenido, sin duplicar las que el borrador ya incluya.
  function withConversationImages(contenido: string | null): string | null {
    const urls = [...new Set(messages.flatMap((m) => extractImageUrls(m.content)))];
    if (urls.length === 0) return contenido;
    const base = (contenido ?? '').trim();
    const faltantes = urls.filter((u) => !base.includes(u));
    if (faltantes.length === 0) return contenido;
    const embeds = faltantes.map((u, i) => `![captura ${i + 1}](${u})`).join('\n');
    return base ? `${base}\n\n${embeds}` : embeds;
  }

  async function createFrom(body: { contenido?: string | null } & Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const contenido = withConversationImages(body.contenido ?? null);
      const res = await fetch('/api/sistemas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, contenido }),
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

  function resolveTarget(nombre: string): Sistema | null {
    const target = nombre.trim().toLowerCase();
    return sistemas.find((s) => (s.nombre ?? '').trim().toLowerCase() === target) ?? null;
  }

  // Resuelve los pasos (sistema por NOMBRE de la IA) a sistema_id.
  function mapPasos(draftPasos: AccionDraftPaso[]): AccionPaso[] {
    return draftPasos
      .map((p) => {
        const sys = resolveTarget(p.sistema);
        return sys
          ? { sistema_id: sys.id, accion: p.accion, dato: p.dato }
          : null;
      })
      .filter((p): p is AccionPaso => p !== null);
  }

  // Busca la acción existente por título (+ sistema para desambiguar).
  function resolveAccion(targetTitulo: string, targetSistema: string): SistemaSeccion | null {
    const t = targetTitulo.trim().toLowerCase();
    const sis = resolveTarget(targetSistema);
    const matches = acciones.filter((a) => (a.titulo ?? '').trim().toLowerCase() === t);
    if (matches.length === 0) return null;
    if (sis) {
      const inSistema = matches.find((a) => a.sistema_id === sis.id);
      if (inSistema) return inSistema;
    }
    return matches[0];
  }

  async function createAccion(target: Sistema, draft: AccionDraft) {
    setLoading(true);
    setError(null);
    try {
      const pasos = mapPasos(draft.pasos ?? []);
      const contenido = withConversationImages(draft.contenido);
      const res = await fetch('/api/sistemas/secciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sistema_id: target.id,
          titulo: draft.titulo,
          tipo: draft.tipo ?? 'acción',
          contenido,
          pasos,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `POST falló (${res.status})`);
      router.refresh();
      resetConversation();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear la acción');
    } finally {
      setLoading(false);
    }
  }

  // Aplica la edición propuesta a una acción existente (pasos + detalle).
  async function applyAccionEdit(
    target: SistemaSeccion,
    draftPasos: AccionDraftPaso[],
    contenido: string | null,
  ) {
    setLoading(true);
    setError(null);
    try {
      const patch: Record<string, unknown> = {};
      // La IA devuelve el flujo COMPLETO actualizado; si vino vacío, conservamos el actual.
      if (draftPasos.length > 0) patch.pasos = mapPasos(draftPasos);
      if (contenido && contenido.trim()) patch.contenido = contenido;
      if (Object.keys(patch).length === 0) {
        setError('La propuesta no traía cambios aplicables.');
        return;
      }
      const res = await fetch(`/api/sistemas/secciones/${target.id}`, {
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
      setError(e instanceof Error ? e.message : 'Error al editar la acción');
    } finally {
      setLoading(false);
    }
  }

  async function applyPatch(target: Sistema, patch: Partial<SistemaDraft>) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sistemas/${target.id}`, {
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
          <h2 className="font-semibold">Asistente de Sistemas</h2>
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
                Crear sistema
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
            const target = resolveTarget(proposal.targetNombre);
            if (!target) {
              return (
                <ProposalBox>
                  <p className="text-sm text-[var(--text)]">
                    No encontré el sistema “{proposal.targetNombre}”. ¿Quieres crearlo?
                  </p>
                  <CreatePreview draft={patchToDraft(proposal.patch, proposal.targetNombre)} />
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() =>
                        createFrom(
                          draftToBody(patchToDraft(proposal.patch, proposal.targetNombre)),
                        )
                      }
                      disabled={loading}
                      className="bg-[var(--accent)] text-white rounded px-4 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
                    >
                      Crear sistema
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
                  Editar {target.nombre}
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

        {proposal && proposal.action === 'propose_create_accion' && (
          (() => {
            const target = resolveTarget(proposal.targetNombre);
            if (!target) {
              return (
                <ProposalBox>
                  <p className="text-sm text-[var(--text)]">
                    No encontré el sistema “{proposal.targetNombre}”. Créalo primero
                    o dime a qué sistema existente pertenece la acción.
                  </p>
                </ProposalBox>
              );
            }
            return (
              <ProposalBox>
                <div className="text-xs text-[var(--muted)] mono">
                  Nueva acción en {target.nombre}
                </div>
                <AccionPreview draft={proposal.draft} />
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => createAccion(target, proposal.draft)}
                    disabled={loading}
                    className="bg-[var(--accent)] text-white rounded px-4 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
                  >
                    Crear acción
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

        {proposal && proposal.action === 'propose_edit_accion' && (
          (() => {
            const target = resolveAccion(proposal.targetTitulo, proposal.targetSistema);
            if (!target) {
              return (
                <ProposalBox>
                  <p className="text-sm text-[var(--text)]">
                    No encontré la acción “{proposal.targetTitulo}”
                    {proposal.targetSistema ? ` en ${proposal.targetSistema}` : ''}.
                    ¿A qué acción te refieres?
                  </p>
                </ProposalBox>
              );
            }
            return (
              <ProposalBox>
                <div className="text-xs text-[var(--muted)] mono">
                  Editar acción: {target.titulo}
                </div>
                {proposal.pasos.length > 0 && (
                  <Field
                    label="Flujo nuevo"
                    value={
                      <ol className="list-decimal list-outside ml-4 space-y-0.5">
                        {proposal.pasos.map((p, i) => (
                          <li key={i} className="text-[var(--text)]">
                            <span className="font-medium">{p.sistema}</span>
                            {p.accion ? `: ${p.accion}` : ''}
                            {p.dato ? (
                              <span className="text-[var(--muted)]"> → {p.dato}</span>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    }
                  />
                )}
                {proposal.contenido && (
                  <Field
                    label="Detalle"
                    value={
                      <span className="text-[var(--muted)]">
                        {summarize(proposal.contenido)}
                      </span>
                    }
                  />
                )}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() =>
                      applyAccionEdit(target, proposal.pasos, proposal.contenido)
                    }
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
              placeholder="Pregunta o describe. Pega una captura para incrustarla; usa «Analizar» si quieres que la IA la lea. (⌘/Ctrl+Enter)"
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

function patchToDraft(patch: Partial<SistemaDraft>, fallbackNombre: string): SistemaDraft {
  return {
    nombre: patch.nombre ?? fallbackNombre,
    descripcion: patch.descripcion ?? null,
    rol: patch.rol ?? null,
    url: patch.url ?? null,
    contenido: patch.contenido ?? null,
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

function CreatePreview({ draft }: { draft: SistemaDraft }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-[var(--muted)] mono">Borrador propuesto</div>
      <Field label="Nombre" value={<span className="font-medium">{draft.nombre}</span>} />
      <Field label="Rol" value={draft.rol} />
      <Field label="Descripción" value={draft.descripcion} />
      <Field label="URL" value={draft.url} />
      {draft.contenido && (
        <Field
          label="Documentación"
          value={<span className="text-[var(--muted)]">{summarize(draft.contenido)}</span>}
        />
      )}
    </div>
  );
}

function AccionPreview({ draft }: { draft: AccionDraft }) {
  const pasos = draft.pasos ?? [];
  return (
    <div className="space-y-1">
      <div className="text-xs text-[var(--muted)] mono">Acción propuesta</div>
      <Field label="Acción" value={<span className="font-medium">{draft.titulo}</span>} />
      <Field label="Tipo" value={draft.tipo} />
      {pasos.length > 0 && (
        <Field
          label="Flujo"
          value={
            <ol className="list-decimal list-outside ml-4 space-y-0.5">
              {pasos.map((p, i) => (
                <li key={i} className="text-[var(--text)]">
                  <span className="font-medium">{p.sistema}</span>
                  {p.accion ? `: ${p.accion}` : ''}
                  {p.dato ? (
                    <span className="text-[var(--muted)]"> → {p.dato}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          }
        />
      )}
      {draft.contenido && (
        <Field
          label="Detalle"
          value={<span className="text-[var(--muted)]">{summarize(draft.contenido)}</span>}
        />
      )}
    </div>
  );
}

const PATCH_LABELS: Record<keyof SistemaDraft, string> = {
  nombre: 'Nombre',
  descripcion: 'Descripción',
  rol: 'Rol',
  url: 'URL',
  contenido: 'Documentación',
};

function PatchPreview({ patch }: { patch: Partial<SistemaDraft> }) {
  const keys = Object.keys(patch) as (keyof SistemaDraft)[];
  if (keys.length === 0) {
    return <p className="text-sm text-[var(--muted)]">Sin cambios propuestos.</p>;
  }
  return (
    <div className="space-y-1">
      <div className="text-xs text-[var(--muted)] mono">Cambios propuestos</div>
      {keys.map((k) => {
        const v = patch[k];
        const display = v == null || v === '' ? '—' : summarize(String(v));
        return <Field key={k} label={PATCH_LABELS[k]} value={display} />;
      })}
    </div>
  );
}

function summarize(s: string): string {
  const trimmed = s.trim().replace(/\s+/g, ' ');
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
}
