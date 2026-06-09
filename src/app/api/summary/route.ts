import { NextRequest, NextResponse } from 'next/server';
import { db, tasks, github_activity, daily_summaries } from '@/db';
import { and, eq, gte, lte, ne } from 'drizzle-orm';
import { fetchActivity } from '@/lib/github';
import { generateSummary } from '@/lib/groq';
import { fetchNews } from '@/lib/news';

const today = () => new Date().toISOString().slice(0, 10);

async function regenerate(): Promise<{ content: string; day: string }> {
  const day = today();

  const activity = await fetchActivity(1);
  if (activity.length) {
    await db.insert(github_activity).values(activity).onConflictDoNothing({
      target: [github_activity.kind, github_activity.sha, github_activity.repo],
    });
  }

  const [ghToday, done, due, news] = await Promise.all([
    db.select().from(github_activity).where(eq(github_activity.day, day)),
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.status, 'done'), gte(tasks.completed_at, new Date(`${day}T00:00:00Z`)))),
    db.select().from(tasks).where(and(ne(tasks.status, 'done'), lte(tasks.due_date, day))),
    fetchNews().catch(() => []),
  ]);

  const content = await generateSummary({
    day,
    tasksDone: done,
    tasksDue: due,
    activity: ghToday,
    news,
  });

  await db
    .insert(daily_summaries)
    .values({ day, content })
    .onConflictDoUpdate({
      target: daily_summaries.day,
      set: { content, generated_at: new Date() },
    });

  return { content, day };
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;

  if (isCron) {
    const r = await regenerate();
    return NextResponse.json({ ...r, viaCron: true });
  }

  const [row] = await db
    .select()
    .from(daily_summaries)
    .where(eq(daily_summaries.day, today()))
    .limit(1);
  return NextResponse.json(row ?? null);
}

export async function POST() {
  try {
    const r = await regenerate();
    const [row] = await db
      .select()
      .from(daily_summaries)
      .where(eq(daily_summaries.day, r.day))
      .limit(1);
    return NextResponse.json(row);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
