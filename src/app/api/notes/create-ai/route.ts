/**
 * Generación de una nota nueva con IA.
 * - POST /api/notes/create-ai → recibe una descripción y devuelve la nota
 *   propuesta (título, carpeta, scope, tags, contenido) — ver `aiCreateNote`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { aiCreateNote } from '@/lib/notes-ai';
import { buildVaultMap } from '@/lib/vault-context';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = String(body.prompt ?? '').trim();
    const preferredFolder = body.folder ? String(body.folder) : undefined;
    if (!prompt) {
      return NextResponse.json({ error: 'prompt requerido' }, { status: 400 });
    }

    const vaultMap = await buildVaultMap();
    const result = await aiCreateNote(prompt, vaultMap, preferredFolder);

    const folder = (preferredFolder || result.suggestedFolder).replace(/^\/+|\/+$/g, '');
    const path = folder ? `${folder}/${result.filename}.md` : `${result.filename}.md`;

    return NextResponse.json({ ...result, path, folder });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
