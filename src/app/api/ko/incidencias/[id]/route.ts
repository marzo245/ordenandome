/**
 * API REST de una incidencia KO concreta (`/api/ko/incidencias/[id]`).
 * - GET    → devuelve la incidencia (404 si no existe).
 * - PATCH  → actualiza campos (refresca `updated_at`).
 * - DELETE → borra la incidencia.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, ko_incidencias } from '@/db';
import { eq } from 'drizzle-orm';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const [row] = await db
      .select()
      .from(ko_incidencias)
      .where(eq(ko_incidencias.id, id))
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
      .update(ko_incidencias)
      .set({ ...rest, updated_at: new Date() })
      .where(eq(ko_incidencias.id, id))
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
    await db.delete(ko_incidencias).where(eq(ko_incidencias.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
