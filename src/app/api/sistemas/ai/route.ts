/**
 * Endpoint del asistente de IA de Sistemas.
 * - POST /api/sistemas/ai → recibe `{ messages }` (chat, con imágenes opcionales),
 *   carga sistemas + acciones como contexto y devuelve un `SistemaAiResult`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, sistemas, sistema_secciones } from '@/db';
import { asc } from 'drizzle-orm';
import { sistemasAssistant } from '@/lib/sistemas-ai';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { messages } = (await req.json()) as {
      messages: {
        role: 'user' | 'assistant';
        content: string;
        images?: string[];
      }[];
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages requerido' }, { status: 400 });
    }

    const [rows, accionRows] = await Promise.all([
      db
        .select()
        .from(sistemas)
        .orderBy(asc(sistemas.orden), asc(sistemas.nombre)),
      db
        .select()
        .from(sistema_secciones)
        .orderBy(asc(sistema_secciones.orden), asc(sistema_secciones.titulo)),
    ]);

    const result = await sistemasAssistant(messages, rows, accionRows);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
