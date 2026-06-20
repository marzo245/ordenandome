/**
 * API REST de los lotes de importación (colección).
 * - GET /api/ko/lotes → lista los lotes (más recientes primero).
 */
import { NextResponse } from 'next/server';
import { db, ko_import_lotes } from '@/db';
import { desc } from 'drizzle-orm';

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(ko_import_lotes)
      .orderBy(desc(ko_import_lotes.created_at));
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
