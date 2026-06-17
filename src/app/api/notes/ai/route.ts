/**
 * Edición asistida por IA del contenido de una nota.
 * - POST /api/notes/ai → recibe contenido + modo (improve/expand/…); devuelve el
 *   nuevo Markdown (ver `aiEditNote`).
 */
import { NextRequest, NextResponse } from 'next/server';
import { aiEditNote, type AiMode } from '@/lib/notes-ai';
import { buildVaultMap } from '@/lib/vault-context';

export const maxDuration = 60;

const VALID: AiMode[] = ['improve', 'expand', 'summarize', 'continue', 'custom'];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const content = typeof body.content === 'string' ? body.content : '';
    const mode = (typeof body.mode === 'string' ? body.mode : 'improve') as AiMode;
    const instruction = typeof body.instruction === 'string' ? body.instruction : undefined;
    if (!VALID.includes(mode)) {
      return NextResponse.json({ error: 'mode inválido' }, { status: 400 });
    }
    // Solo cargamos el mapa del vault para custom/expand (donde wikilinks importan más).
    // Modos cosméticos (improve/summarize) no lo necesitan.
    const needsVault = mode === 'custom' || mode === 'expand' || mode === 'continue';
    const vaultMap = needsVault ? await buildVaultMap() : undefined;

    const result = await aiEditNote(content, mode, instruction, vaultMap);
    return NextResponse.json({ content: result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
