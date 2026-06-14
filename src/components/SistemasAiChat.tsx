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
  'Pregunta por los sistemas (OPERA, eCO, Salesforce, ForceBeat, Beats, SAP), documenta uno nuevo, crea acciones, o pide editar una acción existente (p. ej. «agrega a «Crear cuenta» un paso en SAP»).';

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
  const [attachments, setAttachments] = useState<string[]>([]);
  const [keepImages, setKeepImages] = useState(true);
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

  // ¿Hubo capturas en la conversación? (para ofrecer conservarlas en la doc)
  const hasConversationImages = messages.some((m) => m.images && m.images.length > 0);

  function conversationImages(): string[] {
    return messages.flatMap((m) => m.images ?? []);
  }

  // Sube un data URL al host de imágenes y devuelve la URL pública.
  async function uploadDataUrl(dataUrl: string, i: number): Promise<string> {
    const blob = await (await fetch(dataUrl)).blob();
    const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const file = new File([blob], `captura-${i + 1}.${ext}`, { type: blob.type });
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/notes/upload-image', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok || !data.url) {
      throw new Error((data as { error?: string }).error ?? 'No se pudo subir la captura');
    }
    return data.url as string;
  }

  // Si el usuario quiere conservar las capturas, las sube y las embebe en el markdown.
  async function withKeptImages(contenido: string | null): Promise<string | null> {
    if (!keepImages || !hasConversationImages) return contenido;
    const imgs = conversationImages();
    const urls = await Promise.all(imgs.map((d, i) => uploadDataUrl(d, i)));
    const embeds = urls.map((u, i) => `![captura ${i + 1}](${u})`).join('\n');
    const base = (contenido ?? '').trim();
    return base ? `${base}\n\n${embeds}` : embeds;
  }

  async function createFrom(body: { contenido?: string | null } & Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const contenido = await withKeptImages(body.contenido ?? null);
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
      const contenido = await withKeptImages(draft.contenido);
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

  // Toggle para conservar las capturas en la documentación (solo si hubo imágenes).
  const keepImagesToggle = hasConversationImages ? (
    <label className="flex items-center gap-2 text-xs text-[var(--muted)] pt-1 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={keepImages}
        onChange={(e) => setKeepImages(e.target.checked)}
        className="accent-[var(--accent)]"
      />
      Conservar la(s) captura(s) en la documentación
    </label>
  ) : null;

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
        </div>

        {proposal && proposal.action === 'propose_create' && (
          <ProposalBox>
            <CreatePreview draft={proposal.draft} />
            {keepImagesToggle}
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
                {keepImagesToggle}
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
              placeholder="Pregunta, describe o pega una captura… (⌘/Ctrl+Enter)"
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
