'use client';

import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { Task, TaskPriority, TaskStatus } from '@/lib/types';
import TaskPlannerModal from './TaskPlannerModal';
import TaskDetailModal from './TaskDetailModal';
import TaskCalendar from './TaskCalendar';

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
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [view, setView] = useState<'board' | 'calendar'>('board');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

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

  async function moveDueDate(task: Task, newDate: string) {
    setTasks((t) => t.map((x) => (x.id === task.id ? { ...x, due_date: newDate } : x)));
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due_date: newDate }),
    });
    if (!res.ok) {
      setTasks((t) => t.map((x) => (x.id === task.id ? task : x)));
      throw new Error('No se pudo guardar la nueva fecha');
    }
    const updated = (await res.json()) as Task;
    setTasks((t) => t.map((x) => (x.id === task.id ? updated : x)));
  }

  async function persistStatus(task: Task, status: TaskStatus) {
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setTasks((t) => t.map((x) => (x.id === task.id ? task : x)));
      return;
    }
    const updated = (await res.json()) as Task;
    setTasks((t) => t.map((x) => (x.id === task.id ? updated : x)));
  }

  async function remove(id: string) {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    setTasks((t) => t.filter((x) => x.id !== id));
  }

  function handleDragStart(e: DragStartEvent) {
    const t = tasks.find((x) => x.id === e.active.id);
    if (t) setActiveTask(t);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveTask(null);
    const overId = e.over?.id as TaskStatus | undefined;
    const activeId = e.active.id as string;
    if (!overId) return;

    const task = tasks.find((x) => x.id === activeId);
    if (!task || task.status === overId) return;

    setTasks((t) =>
      t.map((x) => (x.id === activeId ? { ...x, status: overId } : x))
    );
    persistStatus(task, overId);
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
        <button
          onClick={() => setPlannerOpen(true)}
          className="border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white px-4 font-medium"
          title="Describe la tarea en lenguaje natural y la IA te ayuda a planearla"
        >
          ✨ IA
        </button>
      </div>

      <TaskPlannerModal
        open={plannerOpen}
        onClose={() => setPlannerOpen(false)}
        onCreated={(created) => setTasks((t) => [...created, ...t])}
      />

      <nav className="flex gap-1 mb-4 border-b border-[var(--border)]">
        <button
          onClick={() => setView('board')}
          className={`px-4 py-2 text-sm -mb-px border-b-2 ${
            view === 'board'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-transparent text-[var(--muted)] hover:text-white'
          }`}
        >
          Tablero
        </button>
        <button
          onClick={() => setView('calendar')}
          className={`px-4 py-2 text-sm -mb-px border-b-2 ${
            view === 'calendar'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-transparent text-[var(--muted)] hover:text-white'
          }`}
        >
          Calendario
        </button>
      </nav>

      {view === 'board' ? (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-3 gap-4">
            {STATUSES.map((col) => (
              <Column
                key={col.key}
                status={col.key}
                label={col.label}
                tasks={tasks.filter((t) => t.status === col.key)}
                allTasks={tasks}
                onRemove={remove}
                onSelect={setSelectedTask}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask ? <Card task={activeTask} dragging /> : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <TaskCalendar tasks={tasks} onSelect={setSelectedTask} onMove={moveDueDate} />
      )}

      <TaskDetailModal
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onUpdated={(updated) =>
          setTasks((t) => t.map((x) => (x.id === updated.id ? updated : x)))
        }
        onDeleted={(id) => setTasks((t) => t.filter((x) => x.id !== id))}
      />
    </section>
  );
}

function Column({
  status,
  label,
  tasks,
  allTasks,
  onRemove,
  onSelect,
}: {
  status: TaskStatus;
  label: string;
  tasks: Task[];
  allTasks: Task[];
  onRemove: (id: string) => void;
  onSelect: (task: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className="border border-[var(--border)]">
      <h3 className="px-3 py-2 text-sm font-semibold text-[var(--muted)] border-b border-[var(--border)]">
        {label} · {tasks.length}
      </h3>
      <div
        ref={setNodeRef}
        className={`p-2 space-y-2 min-h-[120px] transition-colors ${
          isOver ? 'bg-[var(--accent-dim)]/20' : ''
        }`}
      >
        {tasks.map((t) => (
          <Card
            key={t.id}
            task={t}
            onRemove={onRemove}
            onSelect={onSelect}
            subtaskCount={allTasks.filter((x) => x.parent_id === t.id).length}
          />
        ))}
      </div>
    </div>
  );
}

function Card({
  task,
  onRemove,
  onSelect,
  dragging = false,
  subtaskCount = 0,
}: {
  task: Task;
  onRemove?: (id: string) => void;
  onSelect?: (task: Task) => void;
  dragging?: boolean;
  subtaskCount?: number;
}) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: task.id,
  });

  function handleClick(e: React.MouseEvent) {
    if (transform || isDragging) return;
    if ((e.target as HTMLElement).closest('[data-no-open]')) return;
    onSelect?.(task);
  }

  return (
    <article
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={`bg-[var(--surface)] border-l-2 p-2 group cursor-grab active:cursor-grabbing select-none ${
        isDragging && !dragging ? 'opacity-30' : ''
      } ${dragging ? 'shadow-lg ring-1 ring-[var(--accent)]' : ''}`}
      style={{ borderColor: PRIORITY_COLOR[task.priority] }}
    >
      <div className="flex justify-between items-start gap-2">
        <span className="text-sm">
          {task.parent_id && <span className="text-[var(--muted)] mr-1">↳</span>}
          {task.title}
          {subtaskCount > 0 && (
            <span className="ml-2 text-xs mono text-[var(--muted)]">
              ({subtaskCount} subt.)
            </span>
          )}
        </span>
        {onRemove && (
          <button
            data-no-open
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(task.id);
            }}
            className="text-[var(--muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--danger)]"
          >
            ×
          </button>
        )}
      </div>
      {task.due_date && (
        <span className="mono text-xs text-[var(--muted)]">{task.due_date}</span>
      )}
    </article>
  );
}
