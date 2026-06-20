/**
 * API REST de un caso importado (`/api/ko/casos/[id]`).
 * - PATCH  → actualiza estado de gestión, incidencia (nº + estado), notas, vínculo
 *   o tipo. Registra automáticamente cada cambio en el `historial`.
 * - DELETE → borra el caso.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, ko_import_casos } from '@/db';
import { eq } from 'drizzle-orm';
import type { NewKoImportCaso } from '@/db';

const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Por gestionar',
  en_revision: 'En revisión',
  resuelto: 'Resuelto',
};
const INC_LABEL: Record<string, string> = {
  pendiente: 'Incidencia pendiente',
  enviado: 'Incidencia enviada',
  ok: 'Incidencia OK',
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();

    const [actual] = await db
      .select()
      .from(ko_import_casos)
      .where(eq(ko_import_casos.id, id))
      .limit(1);
    if (!actual) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const patch: Partial<NewKoImportCaso> = { updated_at: new Date() };
    const eventos: string[] = [];

    if (['pendiente', 'en_revision', 'resuelto'].includes(body.estado) && body.estado !== actual.estado) {
      patch.estado = body.estado;
      patch.resolved_at = body.estado === 'resuelto' ? new Date() : null;
      eventos.push(ESTADO_LABEL[body.estado] ?? body.estado);
    }
    if (
      (typeof body.incidencia_numero === 'string' || body.incidencia_numero === null) &&
      body.incidencia_numero !== actual.incidencia_numero
    ) {
      patch.incidencia_numero = body.incidencia_numero || null;
      if (patch.incidencia_numero) eventos.push(`Incidencia nº ${patch.incidencia_numero}`);
    }
    if (
      (['pendiente', 'enviado', 'ok'].includes(body.incidencia_estado) || body.incidencia_estado === null) &&
      body.incidencia_estado !== actual.incidencia_estado
    ) {
      patch.incidencia_estado = body.incidencia_estado || null;
      if (patch.incidencia_estado) eventos.push(INC_LABEL[patch.incidencia_estado]);
    }
    if (typeof body.notas === 'string' || body.notas === null) {
      patch.notas = body.notas;
    }
    if (typeof body.ko_entry_id === 'string' || body.ko_entry_id === null) {
      patch.ko_entry_id = body.ko_entry_id;
    }
    if (body.tipo === 'conocida' || body.tipo === 'desconocida') {
      patch.tipo = body.tipo;
    }
    // Nota manual para el histórico (sin cambiar nada más).
    if (typeof body.nota_historial === 'string' && body.nota_historial.trim()) {
      eventos.push(body.nota_historial.trim());
    }

    if (eventos.length > 0) {
      const at = new Date().toISOString();
      const nuevos = eventos.map((texto) => ({ at, texto }));
      patch.historial = [...(actual.historial ?? []), ...nuevos];
    }

    const [row] = await db
      .update(ko_import_casos)
      .set(patch)
      .where(eq(ko_import_casos.id, id))
      .returning();

    return NextResponse.json(row);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await db.delete(ko_import_casos).where(eq(ko_import_casos.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
