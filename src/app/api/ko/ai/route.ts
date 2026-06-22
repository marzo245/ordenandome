/**
 * Endpoint del asistente de IA de KO.
 * - POST /api/ko/ai → recibe `{ messages }` (chat, con imágenes opcionales),
 *   carga el catálogo de KOs como contexto y devuelve un `KoAiResult`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, ko_entries, ko_import_casos } from '@/db';
import { asc, eq } from 'drizzle-orm';
import { koAssistant, type KoPendienteGroup } from '@/lib/ko-ai';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { messages } = (await req.json()) as {
      messages: { role: 'user' | 'assistant'; content: string; images?: string[] }[];
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages requerido' }, { status: 400 });
    }

    const [entries, pendientesRows] = await Promise.all([
      db.select().from(ko_entries).orderBy(asc(ko_entries.codigo)),
      db
        .select({ error_texto: ko_import_casos.error_texto })
        .from(ko_import_casos)
        .where(eq(ko_import_casos.tipo, 'desconocida')),
    ]);

    // Agrupa las pendientes por "Error normalizado" (top 40 por volumen).
    const counts = new Map<string, number>();
    for (const r of pendientesRows) {
      const label = (r.error_texto ?? '').trim();
      if (!label) continue;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const pendientes: KoPendienteGroup[] = [...counts.entries()]
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 40);

    const result = await koAssistant(messages, entries, pendientes);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
