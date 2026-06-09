'use client';

import { useMemo, useState } from 'react';
import type { Task, TaskPriority } from '@/lib/types';

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  alta: 'var(--danger)',
  media: 'var(--warn)',
  baja: 'var(--muted)',
};

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function buildGrid(month: Date): Date[] {
  const first = startOfMonth(month);
  // Lunes = 0
  const dayOfWeek = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - dayOfWeek);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export default function TaskCalendar({
  tasks,
  onSelect,
}: {
  tasks: Task[];
  onSelect: (task: Task) => void;
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const todayKey = ymd(new Date());
  const cells = useMemo(() => buildGrid(cursor), [cursor]);

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const key = t.due_date.slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  const doingTasks = tasks.filter((t) => t.status === 'doing');

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="font-semibold">
          {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
        </h3>
        <div className="flex gap-1">
          <button
            onClick={() => setCursor(addMonths(cursor, -1))}
            className="border border-[var(--border)] px-3 py-1 text-sm hover:bg-[var(--surface)]"
          >
            ←
          </button>
          <button
            onClick={() => setCursor(startOfMonth(new Date()))}
            className="border border-[var(--border)] px-3 py-1 text-sm hover:bg-[var(--surface)] mono"
          >
            hoy
          </button>
          <button
            onClick={() => setCursor(addMonths(cursor, 1))}
            className="border border-[var(--border)] px-3 py-1 text-sm hover:bg-[var(--surface)]"
          >
            →
          </button>
        </div>
      </header>

      <div className="grid grid-cols-7 text-xs mono text-[var(--muted)]">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-1 text-center">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-t border-l border-[var(--border)]">
        {cells.map((d) => {
          const key = ymd(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = key === todayKey;
          const dayTasks = byDay.get(key) ?? [];
          return (
            <div
              key={key}
              className={`border-r border-b border-[var(--border)] min-h-[88px] p-1 text-xs ${
                inMonth ? '' : 'bg-[var(--surface)]/40 text-[var(--muted)]'
              } ${isToday ? 'ring-1 ring-[var(--accent)] ring-inset' : ''}`}
            >
              <div className={`mono ${isToday ? 'text-[var(--accent)] font-bold' : ''}`}>
                {d.getDate()}
              </div>
              <div className="mt-1 space-y-0.5">
                {dayTasks.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onSelect(t)}
                    title={`${t.title} · ${t.priority} · ${t.status}`}
                    className={`w-full text-left truncate px-1 py-0.5 border-l-2 ${
                      t.status === 'done'
                        ? 'line-through opacity-50'
                        : t.status === 'doing'
                        ? 'bg-[var(--accent)]/15'
                        : 'bg-[var(--surface)]'
                    } hover:bg-[var(--accent)] hover:text-white transition-colors`}
                    style={{ borderColor: PRIORITY_COLOR[t.priority] }}
                  >
                    {t.title}
                  </button>
                ))}
                {dayTasks.length > 3 && (
                  <div className="text-[10px] mono text-[var(--muted)] px-1">
                    +{dayTasks.length - 3} más
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {doingTasks.length > 0 && (
        <section className="border-t border-[var(--border)] pt-3">
          <h4 className="text-xs mono text-[var(--muted)] mb-2">
            En curso ({doingTasks.length})
          </h4>
          <ul className="space-y-1">
            {doingTasks.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => onSelect(t)}
                  className="w-full text-left text-sm flex justify-between gap-2 px-2 py-1.5 border-l-2 bg-[var(--surface)] hover:bg-[var(--accent)] hover:text-white transition-colors"
                  style={{ borderColor: PRIORITY_COLOR[t.priority] }}
                >
                  <span className="truncate">{t.title}</span>
                  {t.due_date && (
                    <span className="mono text-xs text-[var(--muted)] shrink-0">
                      {t.due_date}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
