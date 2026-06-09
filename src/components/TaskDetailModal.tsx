'use client';

import { useEffect, useState } from 'react';
import type { Task, TaskPriority } from '@/lib/types';
import TaskChat from './TaskChat';

interface Props {
  task: Task | null;
  allTasks: Task[];
  onClose: () => void;
  onUpdated: (task: Task) => void;
  onDeleted: (id: string) => void;
  onSelectTask: (task: Task) => void;
}

const STATUS_LABEL: Record<Task['status'], string> = {
  todo: 'Por hacer',
  doing: 'En curso',
  done: 'Hecho',
};

export default function TaskDetailModal({
  task,
  allTasks,
  onClose,
  onUpdated,
  onDeleted,
  onSelectTask,
}: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('media');
  const [dueDate, setDueDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'detail' | 'chat'>('detail');

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description ?? '');
    setPriority(task.priority);
    setDueDate(task.due_date ?? '');
    setDeadline(task.deadline ?? '');
    setTags((task.tags ?? []).join(', '));
    setError(null);
    setTab('detail');
  }, [task]);

  if (!task) return null;

  const parent = task.parent_id
    ? allTasks.find((t) => t.id === task.parent_id) ?? null
    : null;
  const subtasks = allTasks.filter((t) => t.parent_id === task.id);

  const dirty =
    title !== task.title ||
    description !== (task.description ?? '') ||
    priority !== task.priority ||
    dueDate !== (task.due_date ?? '') ||
    deadline !== (task.deadline ?? '') ||
    tags !== (task.tags ?? []).join(', ');

  const deadlineBeforeDue =
    dueDate && deadline && deadline < dueDate
      ? 'La fecha límite es anterior a la fecha programada.'
      : null;

  async function save() {
    if (!task) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          priority,
          due_date: dueDate || null,
          deadline: deadline || null,
          tags: tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar');
      onUpdated(data as Task);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!task) return;
    if (!confirm('¿Eliminar esta tarea?')) return;
    setSaving(true);
    try {
      await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      onDeleted(task.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const created = new Date(task.created_at).toLocaleString();
  const completed = task.completed_at
    ? new Date(task.completed_at).toLocaleString()
    : null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg)] border border-[var(--border)] w-full max-w-xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-4">
            <h2 className="font-semibold">Tarea</h2>
            <nav className="flex gap-1 text-sm">
              <button
                onClick={() => setTab('detail')}
                className={`px-3 py-1 ${
                  tab === 'detail'
                    ? 'border-b-2 border-[var(--accent)] text-[var(--accent)]'
                    : 'text-[var(--muted)] hover:text-white'
                }`}
              >
                Detalle
              </button>
              <button
                onClick={() => setTab('chat')}
                className={`px-3 py-1 ${
                  tab === 'chat'
                    ? 'border-b-2 border-[var(--accent)] text-[var(--accent)]'
                    : 'text-[var(--muted)] hover:text-white'
                }`}
              >
                💡 Chat
              </button>
            </nav>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--danger)] text-xl leading-none"
          >
            ×
          </button>
        </header>

        {tab === 'chat' ? (
          <TaskChat taskId={task.id} />
        ) : (
        <>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {parent && (
            <div className="bg-[var(--surface)] border-l-2 border-[var(--accent)] p-2">
              <div className="text-[10px] mono text-[var(--muted)]">Subtarea de</div>
              <button
                onClick={() => onSelectTask(parent)}
                className="text-sm text-[var(--accent)] hover:underline text-left"
              >
                ↑ {parent.title}
              </button>
            </div>
          )}
          <div>
            <label className="text-xs mono text-[var(--muted)]">Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full mt-1 bg-[var(--surface)] border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label className="text-xs mono text-[var(--muted)]">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full mt-1 bg-[var(--surface)] border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--accent)] resize-y"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mono text-[var(--muted)]">Prioridad</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full mt-1 bg-[var(--surface)] border border-[var(--border)] px-2 py-2"
              >
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </div>
            <div>
              <label className="text-xs mono text-[var(--muted)]">Programada para</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full mt-1 bg-[var(--surface)] border border-[var(--border)] px-2 py-2"
              />
            </div>
          </div>

          <div>
            <label className="text-xs mono text-[var(--muted)]">
              Fecha límite (deadline duro)
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full mt-1 bg-[var(--surface)] border border-[var(--border)] px-2 py-2"
            />
            {deadlineBeforeDue && (
              <p className="text-xs mono text-[var(--danger)] mt-1">{deadlineBeforeDue}</p>
            )}
          </div>

          <div>
            <label className="text-xs mono text-[var(--muted)]">
              Tags (separados por coma)
            </label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="urgente, backend, ~2h"
              className="w-full mt-1 bg-[var(--surface)] border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--accent)]"
            />
          </div>

          {subtasks.length > 0 && (
            <div className="border-t border-[var(--border)] pt-3">
              <div className="text-xs mono text-[var(--muted)] mb-2">
                Subtareas ({subtasks.filter((s) => s.status === 'done').length}/{subtasks.length} hechas)
              </div>
              <ul className="space-y-1">
                {subtasks.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => onSelectTask(s)}
                      className="w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 bg-[var(--surface)] border-l-2 hover:bg-[var(--bg)] transition-colors"
                      style={{
                        borderColor:
                          s.priority === 'alta'
                            ? 'var(--danger)'
                            : s.priority === 'media'
                            ? 'var(--warn)'
                            : 'var(--muted)',
                      }}
                    >
                      <span
                        className={`text-sm truncate ${
                          s.status === 'done' ? 'line-through opacity-60' : ''
                        }`}
                      >
                        ↳ {s.title}
                      </span>
                      <span className="mono text-[10px] text-[var(--muted)] shrink-0">
                        {STATUS_LABEL[s.status]}
                        {s.due_date ? ` · ${s.due_date}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-xs mono text-[var(--muted)] space-y-1 pt-2 border-t border-[var(--border)]">
            <div>estado: {task.status}</div>
            <div>creada: {created}</div>
            {completed && <div>completada: {completed}</div>}
          </div>

          {error && (
            <div className="text-xs mono text-[var(--danger)]">{error}</div>
          )}
        </div>

        <footer className="flex justify-between gap-2 p-3 border-t border-[var(--border)]">
          <button
            onClick={remove}
            disabled={saving}
            className="text-[var(--danger)] hover:underline text-sm disabled:opacity-50"
          >
            Eliminar
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="border border-[var(--border)] px-4 py-1.5 text-sm hover:bg-[var(--surface)]"
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving || !dirty || !title.trim() || !!deadlineBeforeDue}
              className="bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-white px-4 py-1.5 text-sm disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </footer>
        </>
        )}
      </div>
    </div>
  );
}
