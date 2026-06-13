import { NextResponse } from 'next/server';
import { db, notes_cache, note_links, tasks } from '@/db';
import { listVaultMarkdown, getBlob, parseNote } from '@/lib/obsidian';
import { inArray, isNotNull } from 'drizzle-orm';

export const maxDuration = 60;

export async function POST() {
  try {
    // Limpieza retroactiva: borra todas las tareas que vinieron de notas.
    // Las notas ya NO crean tareas automáticamente; esto se hace solo cuando el
    // usuario lo pide explícitamente desde el chat de IA.
    const deletedNoteTasks = await db
      .delete(tasks)
      .where(isNotNull(tasks.source_note_path))
      .returning({ id: tasks.id });

    const files = await listVaultMarkdown();
    const existing = await db.select({ path: notes_cache.path, sha: notes_cache.sha }).from(notes_cache);
    const existingMap = new Map(existing.map((r) => [r.path, r.sha]));

    const livePaths = new Set(files.map((f) => f.path));
    const stale = existing.filter((r) => !livePaths.has(r.path)).map((r) => r.path);

    let updated = 0;
    const linkRows: { from_path: string; to_path: string; kind: 'wiki' }[] = [];

    for (const f of files) {
      const cachedSha = existingMap.get(f.path);
      if (cachedSha === f.sha) continue;

      const raw = await getBlob(f.sha);
      const note = parseNote(f.path, raw);

      await db
        .insert(notes_cache)
        .values({
          path: note.path,
          title: note.title,
          scope: note.scope,
          folder: note.folder,
          frontmatter: note.frontmatter,
          tags: note.tags,
          sha: f.sha,
          size: f.size,
          body_excerpt: note.bodyExcerpt,
          links_to: note.linksTo,
        })
        .onConflictDoUpdate({
          target: notes_cache.path,
          set: {
            title: note.title,
            scope: note.scope,
            folder: note.folder,
            frontmatter: note.frontmatter,
            tags: note.tags,
            sha: f.sha,
            size: f.size,
            body_excerpt: note.bodyExcerpt,
            links_to: note.linksTo,
            updated_at: new Date(),
          },
        });

      for (const target of note.linksTo) {
        linkRows.push({ from_path: note.path, to_path: target, kind: 'wiki' });
      }
      updated++;
    }

    if (stale.length) {
      await db.delete(notes_cache).where(inArray(notes_cache.path, stale));
      await db.delete(note_links).where(inArray(note_links.from_path, stale));
    }

    if (linkRows.length) {
      const fromPaths = [...new Set(linkRows.map((r) => r.from_path))];
      await db.delete(note_links).where(inArray(note_links.from_path, fromPaths));
      const CHUNK = 500;
      for (let i = 0; i < linkRows.length; i += CHUNK) {
        await db.insert(note_links).values(linkRows.slice(i, i + CHUNK)).onConflictDoNothing();
      }
    }

    return NextResponse.json({
      total: files.length,
      updated,
      removed: stale.length,
      tasks_purged: deletedNoteTasks.length,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
