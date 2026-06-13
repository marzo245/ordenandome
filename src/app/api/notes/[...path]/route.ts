import { NextRequest, NextResponse } from 'next/server';
import { db, notes_cache, note_links, tasks } from '@/db';
import { eq, or } from 'drizzle-orm';
import { getNoteContent, parseNote, writeNote } from '@/lib/obsidian';

interface Ctx {
  params: Promise<{ path: string[] }>;
}

function decodePath(segments: string[]) {
  return segments.map(decodeURIComponent).join('/');
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const path = decodePath((await params).path);
    const { content, sha } = await getNoteContent(path);
    const note = parseNote(path, content);

    const [cached] = await db.select().from(notes_cache).where(eq(notes_cache.path, path));
    const basename = path.split('/').pop()!.replace(/\.md$/, '');
    const backlinkRows = await db
      .select({ from_path: note_links.from_path })
      .from(note_links)
      .where(
        or(
          eq(note_links.to_path, basename),
          eq(note_links.to_path, path),
          eq(note_links.to_path, path.replace(/\.md$/, ''))
        )
      );
    const backlinks = [...new Set(backlinkRows.map((b) => b.from_path))];

    return NextResponse.json({
      path,
      sha,
      title: note.title,
      scope: note.scope,
      folder: note.folder,
      frontmatter: note.frontmatter,
      tags: note.tags,
      links_to: note.linksTo,
      backlinks,
      cached_updated_at: cached?.updated_at ?? null,
      content,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const path = decodePath((await params).path);
    const body = await req.json();
    const content = String(body.content ?? '');
    const expectedSha = body.sha ? String(body.sha) : undefined;
    const message = String(body.message ?? `update ${path} via calendario-inteligente`);

    let result;
    try {
      result = await writeNote(path, content, message, expectedSha);
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      if (err.status === 409) {
        return NextResponse.json({ error: 'conflict', detail: 'el archivo cambió en el repo, recarga' }, { status: 409 });
      }
      throw e;
    }

    const note = parseNote(path, content);
    await db
      .insert(notes_cache)
      .values({
        path,
        title: note.title,
        scope: note.scope,
        folder: note.folder,
        frontmatter: note.frontmatter,
        tags: note.tags,
        sha: result.sha,
        size: Buffer.byteLength(content, 'utf-8'),
        body_excerpt: note.bodyExcerpt,
        links_to: note.linksTo,
        updated_at: new Date(),
      })
      .onConflictDoUpdate({
        target: notes_cache.path,
        set: {
          title: note.title,
          scope: note.scope,
          folder: note.folder,
          frontmatter: note.frontmatter,
          tags: note.tags,
          sha: result.sha,
          size: Buffer.byteLength(content, 'utf-8'),
          body_excerpt: note.bodyExcerpt,
          links_to: note.linksTo,
          updated_at: new Date(),
        },
      });

    await db.delete(note_links).where(eq(note_links.from_path, path));
    if (note.linksTo.length) {
      await db
        .insert(note_links)
        .values(note.linksTo.map((to) => ({ from_path: path, to_path: to, kind: 'wiki' as const })))
        .onConflictDoNothing();
    }

    // Las notas ya no crean tareas automáticamente. Si quedaba alguna vieja, se borra.
    await db.delete(tasks).where(eq(tasks.source_note_path, path));

    return NextResponse.json({ ok: true, sha: result.sha, commit: result.commit });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
