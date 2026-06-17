/**
 * API REST de acciones de sistema (`sistema_secciones`, colección).
 * - GET  /api/sistemas/secciones?sistema_id= → lista acciones (opcionalmente filtradas por sistema).
 * - POST /api/sistemas/secciones → crea una acción (requiere `sistema_id` y `titulo`).
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, sistema_secciones } from '@/db';
import { asc, eq } from 'drizzle-orm';

/** Lista acciones; si llega `sistema_id` filtra por ese sistema. */
export async function GET(req: NextRequest) {
  try {
    const sistemaId = req.nextUrl.searchParams.get('sistema_id');
    const rows = sistemaId
      ? await db
          .select()
          .from(sistema_secciones)
          .where(eq(sistema_secciones.sistema_id, sistemaId))
          .orderBy(asc(sistema_secciones.orden), asc(sistema_secciones.titulo))
      : await db
          .select()
          .from(sistema_secciones)
          .orderBy(asc(sistema_secciones.orden), asc(sistema_secciones.titulo));

    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Crea una acción. Ignora id/timestamps del body; valida `sistema_id` y `titulo`. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sistemaId = typeof body.sistema_id === 'string' ? body.sistema_id : '';
    const titulo = typeof body.titulo === 'string' ? body.titulo.trim() : '';

    if (!sistemaId || !titulo) {
      return NextResponse.json(
        { error: 'sistema_id y titulo son requeridos' },
        { status: 400 }
      );
    }

    const { id: _id, created_at: _c, updated_at: _u, ...rest } = body;
    void _id;
    void _c;
    void _u;

    const [row] = await db
      .insert(sistema_secciones)
      .values({ ...rest, sistema_id: sistemaId, titulo })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
