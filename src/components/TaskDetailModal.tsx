'use client';

import { useEffect, useRef, useState } from 'react';
import type { Task, TaskStatus, TaskPriority, TaskType } from '@/lib/types';
import TaskChat from './TaskChat';
import StatusPill from '@/components/properties/StatusPill';
import PriorityPill from '@/components/properties/PriorityPill';
import TypePill from '@/components/properties/TypePill';
import TagsMultiSelect from '@/components/properties/TagsMultiSelect';
import DateRangeField from '@/components/properties/DateRangeField';

interface Props {
  task: Task | null;
  allTasks: Task[];
  onClose: () => void;
  onUpdated: (data: { task: Task; affected: Task[] }) => void;
  onDeleted: (id: string) => void;
  onSelectTask: (task: Task) => void;
}

const STATUS_LABEL: Record<Task['status'], string> = {
  todo: 'Por hacer',
  doing: 'En curso',
  done: 'Hecho',
};

type PatchPayload = Partial<{
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  type: TaskType;
  due_date: string | null;
  deadline: string | null;
  tags: string[];
}>;

type SaveState = 'idle' | 'saving' | 'saved';

/** Modal de detalle/edición de una tarea: campos, propiedades, subtareas y chat de IA. */
export default function TaskDetailModal({
  task,
  allTasks,
  onClose,
  onUpdated,
  onDeleted,
  onSelectTask,
}: Props) {
  // Local optimistic state — keeps UI responsive and avoids flicker.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<TaskPriority>('media');
  const [type, setType] = useState<TaskType>('otro');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [tab, setTab] = useState<'detail' | 'chat'>('detail');
  const [sendingToCal, setSendingToCal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track current task id so async patches don't apply to a stale task.
  const taskIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!task) return;
    taskIdRef.current = task.id;
    setTitle(task.title);
    setDescription(task.description ?? '');
    setStatus(task.status);
    setPriority(task.priority);
    setType(task.type);
    setDueDate(task.due_date ?? null);
    setDeadline(task.deadline ?? null);
    setTags(task.tags ?? []);
    setError(null);
    setInfo(null);
    setSaveState('idle');
    setTab('detail');
    // Cancel any pending text debounce from the previous task.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, [task]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  if (!task) return null;

  const parent = task.parent_id
    ? allTasks.find((t) => t.id === task.parent_id) ?? null
    : null;
  const subtasks = allTasks.filter((t) => t.parent_id === task.id);

  function flashSaved() {
    setSaveState('saved');
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => {
      setSaveState((s) => (s === 'saved' ? 'idle' : s));
    }, 1500);
  }

  async function patchTask(partial: PatchPayload) {
    const id = taskIdRef.current;
    if (!id) return;
    setSaveState('saving');
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar');
      onUpdated(data as { task: Task; affected: Task[] });
      if (data.affected?.length) {
        setInfo(`${data.affected.length} subtarea(s) reagendadas para caber en la nueva fecha.`);
      }
      flashSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaveState('idle');
    }
  }

  // Text fields (title/description): debounced autosave.
  function scheduleTextPatch(partial: PatchPayload) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      patchTask(partial);
    }, 800);
  }

  function flushTextPatch(partial: PatchPayload) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    patchTask(partial);
  }

  function onTitleChange(value: string) {
    setTitle(value);
    scheduleTextPatch({ title: value.trim() });
  }

  function onTitleBlur() {
    if (debounceRef.current) {
      flushTextPatch({ title: title.trim() });
    }
  }

  function onDescriptionChange(value: string) {
    setDescription(value);
    scheduleTextPatch({ description: value.trim() || null });
  }

  function onDescriptionBlur() {
    if (debounceRef.current) {
      flushTextPatch({ description: description.trim() || null });
    }
  }

  // Discrete fields: immediate optimistic autosave.
  function onStatusChange(v: TaskStatus) {
    setStatus(v);
    patchTask({ status: v });
  }
  function onPriorityChange(v: TaskPriority) {
    setPriority(v);
    patchTask({ priority: v });
  }
  function onTypeChange(v: TaskType) {
    setType(v);
    patchTask({ type: v });
  }
  function onDatesChange(start: string | null, end: string | null) {
    setDueDate(start);
    setDeadline(end);
    patchTask({ due_date: start, deadline: end });
  }
  function onTagsChange(next: string[]) {
    setTags(next);
    patchTask({ tags: next });
  }

  async function sendToCalendar() {
    if (!task) return;
    if (!dueDate) {
      setError('Define primero una fecha programada antes de enviar al calendario.');
      return;
    }
    setSendingToCal(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}/calendar`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al crear evento');
      setInfo('Evento creado en Google Calendar. Abriendo…');
      window.open(data.event.htmlLink, '_blank', 'noopener');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSendingToCal(false);
    }
  }

  async function remove() {
    if (!task) return;
    if (!confirm('¿Eliminar esta tarea?')) return;
    setDeleting(true);
    try {
      await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      onDeleted(task.id);
      onClose();
    } finally {
      setDeleting(false);
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
        className="bg-[var(--bg)] border border-[var(--border)] shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-4">
            <nav className="flex gap-1 text-sm">
              <button
                onClick={() => setTab('detail')}
                className={`px-3 py-1 ${
                  tab === 'detail'
                    ? 'border-b-2 border-[var(--text)] text-[var(--text)]'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                Detalle
              </button>
              <button
                onClick={() => setTab('chat')}
                className={`px-3 py-1 ${
                  tab === 'chat'
                    ? 'border-b-2 border-[var(--text)] text-[var(--text)]'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                💡 Chat
              </button>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {tab === 'detail' && saveState !== 'idle' && (
              <span className="text-xs text-[var(--muted)]">
                {saveState === 'saving' ? 'Guardando…' : 'Guardado'}
              </span>
            )}
            <button
              onClick={onClose}
              className="text-[var(--muted)] hover:text-[var(--danger)] text-xl leading-none"
            >
              ×
            </button>
          </div>
        </header>

        {tab === 'chat' ? (
          <TaskChat taskId={task.id} />
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-1">
              {parent && (
                <button
                  onClick={() => onSelectTask(parent)}
                  className="text-xs text-[var(--accent)] hover:underline text-left mb-2 inline-flex items-center gap-1"
                >
                  <span className="text-[var(--muted)]">Subtarea de:</span> ↑ {parent.title}
                </button>
              )}

              {/* Title */}
              <input
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                onBlur={onTitleBlur}
                placeholder="Sin título"
                className="w-full bg-transparent text-2xl font-bold tracking-tight outline-none placeholder:text-[var(--muted)]"
              />

              {/* Properties */}
              <div className="mt-4 space-y-0.5">
                <div className="flex items-center gap-3 py-1">
                  <span className="w-28 shrink-0 text-sm text-[var(--muted)] flex items-center gap-2">
                    <span>📊</span> Estado
                  </span>
                  <StatusPill value={status} onChange={onStatusChange} />
                </div>

                <div className="flex items-center gap-3 py-1">
                  <span className="w-28 shrink-0 text-sm text-[var(--muted)] flex items-center gap-2">
                    <span>⚑</span> Prioridad
                  </span>
                  <PriorityPill value={priority} onChange={onPriorityChange} />
                </div>

                <div className="flex items-center gap-3 py-1">
                  <span className="w-28 shrink-0 text-sm text-[var(--muted)] flex items-center gap-2">
                    <span>🏷️</span> Tipo
                  </span>
                  <TypePill value={type} onChange={onTypeChange} />
                </div>

                <div className="flex items-center gap-3 py-1">
                  <span className="w-28 shrink-0 text-sm text-[var(--muted)] flex items-center gap-2">
                    <span>📅</span> Fechas
                  </span>
                  <DateRangeField start={dueDate} end={deadline} onChange={onDatesChange} />
                </div>

                <div className="flex items-start gap-3 py-1">
                  <span className="w-28 shrink-0 text-sm text-[var(--muted)] flex items-center gap-2 pt-0.5">
                    <span>#</span> Etiquetas
                  </span>
                  <div className="flex-1">
                    <TagsMultiSelect value={tags} onChange={onTagsChange} />
                  </div>
                </div>
              </div>

              <div className="border-t border-[var(--border)] my-4" />

              {/* Description body */}
              <textarea
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                onBlur={onDescriptionBlur}
                placeholder="Escribe algo…"
                className="w-full bg-transparent outline-none resize-none text-sm leading-relaxed placeholder:text-[var(--muted)] min-h-[80px]"
              />

              {subtasks.length > 0 && (
                <div className="border-t border-[var(--border)] pt-3 mt-2">
                  <div className="text-xs mono text-[var(--muted)] mb-2">
                    Subtareas ({subtasks.filter((s) => s.status === 'done').length}/{subtasks.length} hechas)
                  </div>
                  <ul className="space-y-1">
                    {subtasks.map((s) => (
                      <li key={s.id}>
                        <button
                          onClick={() => onSelectTask(s)}
                          className="w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 bg-[var(--surface)] border-l-2 hover:bg-[var(--surface-hover)] transition-colors"
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

              <div className="text-xs mono text-[var(--muted)] space-y-1 pt-3 mt-2 border-t border-[var(--border)]">
                <div>creada: {created}</div>
                {completed && <div>completada: {completed}</div>}
              </div>

              {error && <div className="text-xs mono text-[var(--danger)] pt-1">{error}</div>}
              {info && <div className="text-xs mono text-[var(--text)] pt-1">{info}</div>}
            </div>

            <footer className="flex justify-between gap-2 p-3 border-t border-[var(--border)]">
              <button
                onClick={remove}
                disabled={deleting}
                className="text-[var(--danger)] hover:underline text-sm disabled:opacity-50"
              >
                Eliminar
              </button>
              <button
                onClick={sendToCalendar}
                disabled={sendingToCal || !dueDate}
                title={
                  dueDate
                    ? 'Crea un evento en tu Google Calendar (puede generar duplicados si lo haces varias veces)'
                    : 'Define una fecha programada primero'
                }
                className="border border-[var(--accent)] text-[var(--accent)] px-3 py-1.5 text-sm hover:bg-[var(--accent)] hover:text-white disabled:opacity-50"
              >
                {sendingToCal ? 'Enviando…' : '📅 A Calendar'}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
