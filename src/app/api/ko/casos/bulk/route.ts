/**
 * Acciones masivas sobre casos importados.
 * - POST /api/ko/casos/bulk → `{ action, ids }` con action:
 *   - `resolver`  → marca los casos como resueltos (sella `resolved_at`).
 *   - `reabrir`   → vuelve a pendiente (limpia `resolved_at`).
 *   - `descartar` → borra los casos.
 *   Devuelve `{ count }`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, ko_import_casos } from '@/db';
import { inArray, sql } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action;
    const ids: string[] = Array.isArray(body.ids)
      ? body.ids.filter((x: unknown): x is string => typeof x === 'string')
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: 'ids requerido' }, { status: 400 });
    }

    if (action === 'descartar') {
      const removed = await db
        .delete(ko_import_casos)
        .where(inArray(ko_import_casos.id, ids))
        .returning({ id: ko_import_casos.id });
      return NextResponse.json({ count: removed.length });
    }

    if (action === 'resolver' || action === 'reabrir') {
      const estado = action === 'resolver' ? 'resuelto' : 'pendiente';
      // Registramos el cambio en el histórico de cada caso (append jsonb sin leer).
      const at = new Date().toISOString();
      const texto = action === 'resolver' ? 'Resuelto' : 'Por gestionar';
      const updated = await db
        .update(ko_import_casos)
        .set({
          estado,
          resolved_at: action === 'resolver' ? new Date() : null,
          updated_at: new Date(),
          historial: sql`${ko_import_casos.historial} || jsonb_build_array(jsonb_build_object('at', ${at}::text, 'texto', ${texto}::text))`,
        })
        .where(inArray(ko_import_casos.id, ids))
        .returning({ id: ko_import_casos.id });
      return NextResponse.json({ count: updated.length });
    }

    return NextResponse.json(
      { error: "action debe ser 'resolver', 'reabrir' o 'descartar'" },
      { status: 400 }
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
