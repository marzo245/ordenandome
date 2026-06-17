/**
 * API REST de una acción concreta (`/api/sistemas/secciones/[id]`).
 * - GET    → devuelve la acción (404 si no existe).
 * - PATCH  → actualiza campos (incluye `pasos`; refresca `updated_at`).
 * - DELETE → borra la acción.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, sistema_secciones } from '@/db';
import { eq } from 'drizzle-orm';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const [row] = await db
      .select()
      .from(sistema_secciones)
      .where(eq(sistema_secciones.id, id))
      .limit(1);
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(row);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = body;
    void _id;
    void _c;
    void _u;

    const [row] = await db
      .update(sistema_secciones)
      .set({ ...rest, updated_at: new Date() })
      .where(eq(sistema_secciones.id, id))
      .returning();

    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
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
    await db.delete(sistema_secciones).where(eq(sistema_secciones.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
