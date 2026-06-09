'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { Task, TaskPriority } from '@/lib/types';

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  alta: 'var(--danger)',
  media: 'var(--warn)',
  baja: 'var(--muted)',
};

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function buildGrid(month: Date): Date[] {
  const first = startOfMonth(month);
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

interface Props {
  tasks: Task[];
  onSelect: (task: Task) => void;
  onMove: (task: Task, newDate: string) => Promise<void>;
}

export default function TaskCalendar({ tasks, onSelect, onMove }: Props) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  );

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

  const deadlinesByDay = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (t.deadline) set.add(t.deadline.slice(0, 10));
    }
    return set;
  }, [tasks]);

  const doingTasks = tasks.filter((t) => t.status === 'doing');

  function handleDragStart(e: DragStartEvent) {
    const t = tasks.find((x) => x.id === e.active.id);
    if (t) setActiveTask(t);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleDragEnd(e: DragEndEvent) {
    const task = activeTask;
    setActiveTask(null);
    if (!e.over || !task) return;

    const target = e.over.id as string;
    if (!target.startsWith('day:')) return;
    const newDate = target.slice(4);
    if (newDate === task.due_date) return;

    if (task.deadline && newDate > task.deadline) {
      showToast(`No puedes mover "${task.title}" más allá de su fecha límite (${task.deadline}).`);
      return;
    }

    try {
      await onMove(task, newDate);
    } catch (err) {
      showToast((err as Error).message);
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-3 relative">
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

        <p className="text-xs mono text-[var(--muted)]">
          Arrastra una tarea a otro día para reprogramarla. La fecha límite (●) la bloquea.
        </p>

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
            const isDeadline = deadlinesByDay.has(key);
            return (
              <DayCell
                key={key}
                dateKey={key}
                day={d.getDate()}
                inMonth={inMonth}
                isToday={isToday}
                isDeadline={isDeadline}
                tasks={dayTasks}
                activeTask={activeTask}
                onSelect={onSelect}
              />
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

        {toast && (
          <div className="fixed bottom-4 right-4 bg-[var(--danger)] text-white px-4 py-2 text-sm shadow-lg z-50 max-w-sm">
            {toast}
          </div>
        )}
      </div>

      <DragOverlay>
        {activeTask ? <TaskChip task={activeTask} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function DayCell({
  dateKey,
  day,
  inMonth,
  isToday,
  isDeadline,
  tasks,
  activeTask,
  onSelect,
}: {
  dateKey: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isDeadline: boolean;
  tasks: Task[];
  activeTask: Task | null;
  onSelect: (task: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${dateKey}` });

  const blocked =
    !!activeTask?.deadline && dateKey > activeTask.deadline;

  return (
    <div
      ref={setNodeRef}
      className={`border-r border-b border-[var(--border)] min-h-[60px] sm:min-h-[88px] p-0.5 sm:p-1 text-[10px] sm:text-xs transition-colors ${
        inMonth ? '' : 'bg-[var(--surface)]/40 text-[var(--muted)]'
      } ${isToday ? 'ring-1 ring-[var(--accent)] ring-inset' : ''} ${
        isOver && !blocked ? 'bg-[var(--accent)]/15' : ''
      } ${isOver && blocked ? 'bg-[var(--danger)]/20' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className={`mono ${isToday ? 'text-[var(--accent)] font-bold' : ''}`}>
          {day}
        </span>
        {isDeadline && (
          <span
            className="text-[var(--danger)] text-base leading-none"
            title="Fecha límite de alguna tarea"
          >
            ●
          </span>
        )}
      </div>
      <div className="mt-1 space-y-0.5">
        {tasks.slice(0, 3).map((t) => (
          <DraggableChip key={t.id} task={t} onSelect={onSelect} />
        ))}
        {tasks.length > 3 && (
          <div className="text-[10px] mono text-[var(--muted)] px-1">
            +{tasks.length - 3} más
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableChip({
  task,
  onSelect,
}: {
  task: Task;
  onSelect: (task: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: task.id,
  });

  function handleClick(e: React.MouseEvent) {
    if (transform || isDragging) return;
    e.stopPropagation();
    onSelect(task);
  }

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      title={`${task.title} · ${task.priority} · ${task.status}${
        task.deadline ? ` · límite ${task.deadline}` : ''
      }`}
      className={`w-full text-left truncate px-1 py-0.5 border-l-2 cursor-grab active:cursor-grabbing touch-none ${
        task.status === 'done'
          ? 'line-through opacity-50'
          : task.status === 'doing'
          ? 'bg-[var(--accent)]/15'
          : 'bg-[var(--surface)]'
      } hover:bg-[var(--accent)] hover:text-white transition-colors ${
        isDragging ? 'opacity-30' : ''
      }`}
      style={{ borderColor: PRIORITY_COLOR[task.priority] }}
    >
      {task.title}
    </button>
  );
}

function TaskChip({ task, dragging = false }: { task: Task; dragging?: boolean }) {
  return (
    <div
      className={`px-2 py-1 text-xs border-l-2 bg-[var(--surface)] shadow-lg ${
        dragging ? 'ring-1 ring-[var(--accent)]' : ''
      }`}
      style={{ borderColor: PRIORITY_COLOR[task.priority] }}
    >
      {task.title}
    </div>
  );
}
