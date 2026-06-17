'use client';

import { useRef, useState } from 'react';

/**
 * Textarea de markdown que acepta **pegar (Ctrl/⌘+V) y arrastrar** imágenes:
 * sube el archivo a `/api/notes/upload-image` e inserta `![alt](url)` en la
 * posición del cursor. Si lo pegado no es una imagen, deja el pegado normal.
 *
 * Componente controlado compartido por los editores de KO, Sistemas y Notas.
 */
export default function MarkdownImageTextarea({
  value,
  onChange,
  rows,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function insertAtCursor(text: string) {
    const el = ref.current;
    if (!el) {
      onChange(value + text);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function uploadImage(file: File) {
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/notes/upload-image', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error((data as { error?: string }).error ?? `subida falló (${res.status})`);
      }
      insertAtCursor(`![${data.alt || ''}](${data.url})\n`);
    } catch (e) {
      setErr(`Error subiendo imagen: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  // Extrae el primer archivo de imagen de un DataTransfer (items o files).
  function imageFrom(dt: DataTransfer | null): File | null {
    if (!dt) return null;
    for (const it of Array.from(dt.items ?? [])) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) return f;
      }
    }
    for (const f of Array.from(dt.files ?? [])) {
      if (f.type.startsWith('image/')) return f;
    }
    return null;
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const file = imageFrom(e.clipboardData);
    if (!file) return; // no hay imagen → deja el pegado normal (texto)
    e.preventDefault();
    void uploadImage(file);
  }

  function onDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    const file = imageFrom(e.dataTransfer);
    if (!file) return;
    e.preventDefault();
    void uploadImage(file);
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        rows={rows}
        placeholder={placeholder}
        className={className}
      />
      {uploading && (
        <span className="absolute top-1.5 right-2 text-[11px] text-[var(--muted)] mono bg-[var(--bg)] px-1 rounded">
          subiendo…
        </span>
      )}
      {err && <p className="text-xs text-[var(--danger)] mt-1">{err}</p>}
    </div>
  );
}
