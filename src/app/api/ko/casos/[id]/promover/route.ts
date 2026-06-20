/**
 * Promueve un caso pendiente a "conocido".
 * - POST /api/ko/casos/[id]/promover
 *   - `{ mode: 'link', ko_entry_id }` → vincula el caso a un KO existente.
 *   - `{ mode: 'create', koData }`   → crea un KO nuevo (requiere `error`) y
 *     vincula el caso a él.
 *   En ambos casos el caso pasa a `tipo='conocida'`. Devuelve `{ caso, koEntry }`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, ko_entries, ko_import_casos } from '@/db';
import { eq } from 'drizzle-orm';
import type { KoEntry } from '@/db';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const mode = body.mode;

    let koEntry: KoEntry | undefined;

    if (mode === 'link') {
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
    } else if (mode === 'create') {
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

    const [caso] = await db
      .update(ko_import_casos)
      .set({ ko_entry_id: koEntry.id, tipo: 'conocida', updated_at: new Date() })
      .where(eq(ko_import_casos.id, id))
      .returning();

    if (!caso) return NextResponse.json({ error: 'caso no encontrado' }, { status: 404 });
    return NextResponse.json({ caso, koEntry }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
