/**
 * Sincronización de actividad de GitHub.
 * - GET /api/github/sync?days=N → trae commits/PRs de los últimos N días y los
 *   inserta en `github_activity` (idempotente, `onConflictDoNothing`).
 * Accesible vía CRON_SECRET (ver middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, github_activity } from '@/db';
import { fetchActivity } from '@/lib/github';

export async function GET(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get('days') ?? '1');

  try {
    const activity = await fetchActivity(days);
    if (activity.length) {
      await db.insert(github_activity).values(activity).onConflictDoNothing({
        target: [github_activity.kind, github_activity.sha, github_activity.repo],
      });
    }
    return NextResponse.json({ synced: activity.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
