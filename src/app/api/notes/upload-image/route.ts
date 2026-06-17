/**
 * Subida de imágenes para los editores de Markdown.
 * - POST /api/notes/upload-image → sube la imagen a imgbb (si hay `IMGBB_API_KEY`)
 *   con fallback a catbox.moe; devuelve `{ url }`.
 */
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

/** Sube el archivo a imgbb y devuelve la URL pública. @throws si imgbb falla. */
async function uploadImgBB(file: File): Promise<string> {
  const key = process.env.IMGBB_API_KEY;
  if (!key) throw new Error('no-imgbb-key');
  const buf = Buffer.from(await file.arrayBuffer());
  const fd = new FormData();
  fd.append('key', key);
  fd.append('image', buf.toString('base64'));
  fd.append('name', file.name || 'image');
  const res = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`imgbb ${res.status}`);
  const data = await res.json();
  const url = data?.data?.url;
  if (!url) throw new Error('imgbb sin url');
  return url as string;
}

async function uploadCatbox(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('reqtype', 'fileupload');
  fd.append('fileToUpload', file, file.name || 'image');
  const res = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: fd });
  const text = (await res.text()).trim();
  if (!res.ok || !text.startsWith('http')) throw new Error(`catbox: ${text || res.status}`);
  return text;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file requerido (multipart)' }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'máximo 10MB' }, { status: 413 });
    }

    let url: string;
    let provider: string;
    try {
      url = await uploadImgBB(file);
      provider = 'imgbb';
    } catch (e) {
      if ((e as Error).message !== 'no-imgbb-key') {
        // imgbb falló de verdad: registra y cae a catbox
        console.warn('imgbb upload failed, falling back', e);
      }
      url = await uploadCatbox(file);
      provider = 'catbox';
    }

    return NextResponse.json({ url, provider, alt: file.name?.replace(/\.[^.]+$/, '') ?? '' });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
