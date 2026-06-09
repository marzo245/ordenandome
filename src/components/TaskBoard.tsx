'use client';

import { useState } from 'react';
import type { Task, TaskPriority, TaskStatus } from '@/lib/types';

const STATUSES: { key: TaskStatus; label: string }[] = [
  { key: 'todo', label: 'Por hacer' },
  { key: 'doing', label: 'En curso' },
  { key: 'done', label: 'Hecho' },
];

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  alta: 'var(--danger)',
  media: 'var(--warn)',
  baja: 'var(--muted)',
};

export default function TaskBoard({ initial }: { initial: Task[] }) {
  const [tasks, setTasks] = useState<Task[]>(initial);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('media');
  const [due, setDue] = useState('');

  async function addTask() {
    if (!title.trim()) return;
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, priority, due_date: due || null }),
    });
    const task = await res.json();
    setTasks((t) => [task, ...t]);
    setTitle('');
    setDue('');
  }

  async function move(task: Task, status: TaskStatus) {
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const updated = await res.json();
    setTasks((t) => t.map((x) => (x.id === task.id ? updated : x)));
  }

  async function remove(id: string) {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    setTasks((t) => t.filter((x) => x.id !== id));
  }

  return (
    <section>
      <div className="flex gap-2 mb-6">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTask()}
          placeholder="Nueva tarea…"
          className="flex-1 bg-[var(--surface)] border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--accent)]"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className="bg-[var(--surface)] border border-[var(--border)] px-2"
        >
          <option value="baja">Baja</option>
          <option value="media">Media</option>
          <option value="alta">Alta</option>
        </select>
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="bg-[var(--surface)] border border-[var(--border)] px-2"
        />
        <button
          onClick={addTask}
          className="bg-[var(--accent)] hover:bg-[var(--accent-dim)] px-4 font-medium text-white"
        >
          Agregar
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {STATUSES.map((col) => (
          <div key={col.key} className="border border-[var(--border)]">
            <h3 className="px-3 py-2 text-sm font-semibold text-[var(--muted)] border-b border-[var(--border)]">
              {col.label} · {tasks.filter((t) => t.status === col.key).length}
            </h3>
            <div className="p-2 space-y-2 min-h-[120px]">
              {tasks
                .filter((t) => t.status === col.key)
                .map((t) => (
                  <article
                    key={t.id}
                    className="bg-[var(--surface)] border-l-2 p-2 group"
                    style={{ borderColor: PRIORITY_COLOR[t.priority] }}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-sm">{t.title}</span>
                      <button
                        onClick={() => remove(t.id)}
                        className="text-[var(--muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--danger)]"
                      >
                        ×
                      </button>
                    </div>
                    {t.due_date && (
                      <span className="mono text-xs text-[var(--muted)]">{t.due_date}</span>
                    )}
                    <div className="flex gap-1 mt-2">
                      {STATUSES.filter((s) => s.key !== col.key).map((s) => (
                        <button
                          key={s.key}
                          onClick={() => move(t, s.key)}
                          className="mono text-xs text-[var(--accent)] hover:underline"
                        >
                          →{s.label}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
