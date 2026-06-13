import { NextRequest, NextResponse } from 'next/server';
import { db, ko_entries } from '@/db';
import { asc } from 'drizzle-orm';

export async function GET() {
  try {
    const rows = await db.select().from(ko_entries).orderBy(asc(ko_entries.codigo));
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const codigo = typeof body.codigo === 'string' ? body.codigo.trim() : null;
    const error = typeof body.error === 'string' ? body.error.trim() : '';
    if (!error) {
      return NextResponse.json(
        { error: 'error es requerido' },
        { status: 400 }
      );
    }

    const { id: _id, created_at: _c, updated_at: _u, ...rest } = body;
    void _id;
    void _c;
    void _u;

    const [row] = await db
      .insert(ko_entries)
      .values({ ...rest, codigo, error })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
