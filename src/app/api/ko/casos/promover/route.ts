/**
 * Promueve un GRUPO de casos pendientes a "conocidos" de una vez.
 * - POST /api/ko/casos/promover
 *   - `{ mode: 'link', ko_entry_id, caso_ids }`  → vincula los casos a un KO existente.
 *   - `{ mode: 'create', koData, caso_ids }`     → crea un KO nuevo y vincula los casos.
 *   Los casos pasan a `tipo='conocida'`. Devuelve `{ koEntry, count }`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, ko_entries, ko_import_casos } from '@/db';
import { eq, inArray } from 'drizzle-orm';
import type { KoEntry } from '@/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const casoIds: string[] = Array.isArray(body.caso_ids)
      ? body.caso_ids.filter((x: unknown): x is string => typeof x === 'string')
      : [];
    if (casoIds.length === 0) {
      return NextResponse.json({ error: 'caso_ids requerido' }, { status: 400 });
    }

    let koEntry: KoEntry | undefined;

    if (body.mode === 'link') {
      const koId = body.ko_entry_id;
      if (typeof koId !== 'string' || !koId) {
        return NextResponse.json({ error: 'ko_entry_id requerido' }, { status: 400 });
      }
      [koEntry] = await db
        .select()
        .from(ko_entries)
        .where(eq(ko_entries.id, koId))
        .limit(1);
      if (!koEntry) {
        return NextResponse.json({ error: 'KO no encontrado' }, { status: 404 });
      }
    } else if (body.mode === 'create') {
      const koData = body.koData ?? {};
      const error = typeof koData.error === 'string' ? koData.error.trim() : '';
      if (!error) {
        return NextResponse.json({ error: 'error es requerido' }, { status: 400 });
      }
      const { id: _id, created_at: _c, updated_at: _u, ...rest } = koData;
      void _id;
      void _c;
      void _u;
      const codigo = typeof koData.codigo === 'string' ? koData.codigo.trim() || null : null;
      [koEntry] = await db
        .insert(ko_entries)
        .values({ ...rest, codigo, error })
        .returning();
    } else {
      return NextResponse.json({ error: "mode debe ser 'link' o 'create'" }, { status: 400 });
    }

    const updated = await db
      .update(ko_import_casos)
      .set({
        ko_entry_id: koEntry.id,
        codigo: koEntry.codigo,
        tipo: 'conocida',
        updated_at: new Date(),
      })
      .where(inArray(ko_import_casos.id, casoIds))
      .returning();

    return NextResponse.json({ koEntry, count: updated.length }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
