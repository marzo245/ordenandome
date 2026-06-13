import { NextRequest, NextResponse } from 'next/server';
import { db, reading_list } from '@/db';
import { desc } from 'drizzle-orm';

export async function GET() {
  try {
    const rows = await db.select().from(reading_list).orderBy(desc(reading_list.created_at));
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, author, cover_url, status, niche, olid, notes } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title requerido' }, { status: 400 });
  }

  try {
    const values: typeof reading_list.$inferInsert = {
      title: title.trim(),
      author: author ?? null,
      cover_url: cover_url ?? null,
      status: status ?? 'reading',
      niche: niche ?? 'other',
      olid: olid ?? null,
      notes: notes ?? null,
    };
    if (values.status === 'reading') {
      values.started_at = new Date().toISOString().slice(0, 10);
    }
    const [row] = await db.insert(reading_list).values(values).returning();
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
