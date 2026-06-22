/**
 * Re-cruza los casos PENDIENTES contra el catálogo actual (sin re-subir el Excel).
 * - POST /api/ko/casos/recruzar
 *   Útil tras crear/editar KOs: las pendientes cuyo «Error normalizado» ahora
 *   cruza con un KO pasan a conocidas (vinculadas a ese KO). Devuelve `{ movidas }`.
 */
import { NextResponse } from 'next/server';
import { db, ko_entries, ko_import_casos } from '@/db';
import { eq, inArray } from 'drizzle-orm';
import { buildKoIndex, createKoMatcher, ecoNotesDeFila } from '@/lib/ko-match';

export const maxDuration = 60;

export async function POST() {
  try {
    const [catalogo, pendientes] = await Promise.all([
      db.select().from(ko_entries),
      db.select().from(ko_import_casos).where(eq(ko_import_casos.tipo, 'desconocida')),
    ]);

    const match = createKoMatcher(buildKoIndex(catalogo));

    // Agrupamos las pendientes que ahora cruzan, por KO, para actualizar en bloque.
    const porKo = new Map<string, { codigo: string | null; ids: string[] }>();
    for (const c of pendientes) {
      const ko = match(c.error_texto, ecoNotesDeFila(c.fila));
      if (!ko) continue;
      if (!porKo.has(ko.id)) porKo.set(ko.id, { codigo: ko.codigo, ids: [] });
      porKo.get(ko.id)!.ids.push(c.id);
    }

    let movidas = 0;
    for (const [koId, { codigo, ids }] of porKo) {
      await db
        .update(ko_import_casos)
        .set({ ko_entry_id: koId, codigo, tipo: 'conocida', updated_at: new Date() })
        .where(inArray(ko_import_casos.id, ids));
      movidas += ids.length;
    }

    return NextResponse.json({ movidas });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
