import { supabase } from '@/lib/supabase';
import TaskBoard from '@/components/TaskBoard';
import DailySummary from '@/components/DailySummary';
import GitHubActivity from '@/components/GitHubActivity';

export const dynamic = 'force-dynamic'; // siempre datos frescos

export default async function Page() {
  const day = new Date().toISOString().slice(0, 10);

  const [{ data: tasks }, { data: activity }, { data: summary }] = await Promise.all([
    supabase
      .from('tasks')
      .select('*')
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('github_activity').select('*').eq('day', day),
    supabase.from('daily_summaries').select('*').eq('day', day).maybeSingle(),
  ]);

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <header className="mb-8 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">
          Calendario <span className="text-[var(--accent)]">Inteligente</span>
        </h1>
        <span className="mono text-sm text-[var(--muted)]">{day}</span>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TaskBoard initial={tasks ?? []} />
        </div>
        <div className="space-y-6">
          <DailySummary initial={summary ?? null} />
          <GitHubActivity items={activity ?? []} />
        </div>
      </div>
    </main>
  );
}
