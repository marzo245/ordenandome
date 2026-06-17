/**
 * Listado/búsqueda de notas desde la cache (`notes_cache`).
 * - GET /api/notes → lista notas con filtros opcionales (scope, carpeta, texto…).
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, notes_cache } from '@/db';
import { and, eq, ilike, sql, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const scope = sp.get('scope');
    const folder = sp.get('folder');
    const tag = sp.get('tag');
    const q = sp.get('q');
    const limit = Math.min(Number(sp.get('limit') ?? 100), 500);

    const conds = [];
    if (scope) conds.push(eq(notes_cache.scope, scope as 'work' | 'personal' | 'study' | 'unknown'));
    if (folder) conds.push(ilike(notes_cache.folder, `${folder}%`));
    if (tag) conds.push(sql`${tag} = ANY(${notes_cache.tags})`);
    if (q) conds.push(sql`(${notes_cache.title} ILIKE ${'%' + q + '%'} OR ${notes_cache.body_excerpt} ILIKE ${'%' + q + '%'})`);

    const rows = await db
      .select({
        path: notes_cache.path,
        title: notes_cache.title,
        scope: notes_cache.scope,
        folder: notes_cache.folder,
        tags: notes_cache.tags,
        body_excerpt: notes_cache.body_excerpt,
        updated_at: notes_cache.updated_at,
      })
      .from(notes_cache)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(notes_cache.updated_at))
      .limit(limit);

    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
