import { NextRequest, NextResponse } from 'next/server';
import { db, tasks } from '@/db';
import { asc, desc, sql } from 'drizzle-orm';

export async function GET() {
  try {
    const data = await db
      .select()
      .from(tasks)
      .orderBy(sql`${tasks.due_date} ASC NULLS LAST`, desc(tasks.created_at));
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, description, priority, due_date, tags } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title requerido' }, { status: 400 });
  }

  try {
    const [row] = await db
      .insert(tasks)
      .values({ title, description, priority, due_date, tags })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
