/**
 * API REST del catálogo de incidencias KO (colección).
 * - GET  /api/ko/incidencias → lista todas las incidencias.
 * - POST /api/ko/incidencias → crea una incidencia (autogenera código si falta).
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, ko_incidencias } from '@/db';
import { asc } from 'drizzle-orm';

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(ko_incidencias)
      .orderBy(asc(ko_incidencias.codigo));
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Próximo código `INC-NNN` libre. */
async function nextCodigo(): Promise<string> {
  const rows = await db.select({ codigo: ko_incidencias.codigo }).from(ko_incidencias);
  let max = 0;
  for (const r of rows) {
    const m = /^INC-(\d+)$/i.exec((r.codigo ?? '').trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `INC-${String(max + 1).padStart(3, '0')}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const titulo = typeof body.titulo === 'string' ? body.titulo.trim() : '';
    if (!titulo) {
      return NextResponse.json({ error: 'titulo es requerido' }, { status: 400 });
    }
    const codigo =
      typeof body.codigo === 'string' && body.codigo.trim()
        ? body.codigo.trim()
        : await nextCodigo();

    const { id: _id, created_at: _c, updated_at: _u, ...rest } = body;
    void _id;
    void _c;
    void _u;

    const [row] = await db
      .insert(ko_incidencias)
      .values({ ...rest, codigo, titulo })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
