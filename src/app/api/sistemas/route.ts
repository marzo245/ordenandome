import { NextRequest, NextResponse } from 'next/server';
import { db, sistemas } from '@/db';
import { asc } from 'drizzle-orm';

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(sistemas)
      .orderBy(asc(sistemas.orden), asc(sistemas.nombre));
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
    if (!nombre) {
      return NextResponse.json(
        { error: 'nombre es requerido' },
        { status: 400 }
      );
    }

    const { id: _id, created_at: _c, updated_at: _u, ...rest } = body;
    void _id;
    void _c;
    void _u;

    const [row] = await db
      .insert(sistemas)
      .values({ ...rest, nombre })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
