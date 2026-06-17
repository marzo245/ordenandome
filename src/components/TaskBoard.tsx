'use client';

import { useEffect, useState } from 'react';
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
import type { Task, TaskPriority, TaskStatus, TaskType } from '@/lib/types';
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

const TYPE_STYLE: Record<TaskType, { bg: string; text: string; label: string }> = {
  trabajo:  { bg: '#d3e5ef', text: '#183347', label: 'Trabajo' },
  personal: { bg: '#e8deee', text: '#412454', label: 'Personal' },
  estudio:  { bg: '#fadec9', text: '#49290e', label: 'Estudio' },
  otro:     { bg: '#e9e9e7', text: '#37352f', label: 'Otro' },
};

const TYPE_FILTERS: { key: TaskType | 'todos'; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'trabajo', label: 'Trabajo' },
  { key: 'personal', label: 'Personal' },
  { key: 'estudio', label: 'Estudio' },
  { key: 'otro', label: 'Otro' },
];

/** Tablero Kanban de tareas (columnas todo/doing/done) con arrastrar-y-soltar (dnd-kit). */
export default function TaskBoard({ initial }: { initial: Task[] }) {
  const [tasks, setTasks] = useState<Task[]>(initial);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [view, setView] = useState<'board' | 'calendar'>('board');
  const [typeFilter, setTypeFilter] = useState<TaskType | 'todos'>('todos');

  // Sincroniza el estado local cuando cambian las props (p.ej. tras router.refresh()
  // disparado por el botón global de "nueva tarea con IA").
  useEffect(() => {
    setTasks(initial);
  }, [initial]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  );

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
    const data = (await res.json()) as { task: Task; affected: Task[] };
    mergeUpdated(data);
  }

  function mergeUpdated(data: { task: Task; affected: Task[] }) {
    const byId = new Map<string, Task>();
    byId.set(data.task.id, data.task);
    for (const a of data.affected) byId.set(a.id, a);
    setTasks((t) => t.map((x) => byId.get(x.id) ?? x));
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
    const data = (await res.json()) as { task: Task; affected: Task[] };
    mergeUpdated(data);
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

  async function purgeFromNotes() {
    if (!confirm('Borrar todas las tareas auto-importadas desde notas? Las que creaste con ✨ IA o a mano se conservan.')) return;
    const res = await fetch('/api/tasks/purge-from-notes', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      alert(`Error: ${data.error}`);
      return;
    }
    setTasks((t) => t.filter((x) => !x.source_note_path));
    alert(`Borradas ${data.deleted} tareas importadas de notas.`);
  }

  const hasNoteTasks = tasks.some((t) => t.source_note_path);

  const visibleTasks =
    typeFilter === 'todos' ? tasks : tasks.filter((t) => t.type === typeFilter);

  return (
    <section>
      {hasNoteTasks && (
        <div className="flex mb-4 sm:mb-6">
          <button
            onClick={purgeFromNotes}
            className="mono text-xs px-3 py-2 border border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white"
            title="Borrar las tareas que se auto-importaron desde checkboxes de notas"
          >
            🧹 limpiar importadas
          </button>
        </div>
      )}

      <div className="flex items-center flex-wrap gap-1 mb-4">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setTypeFilter(f.key)}
            className={`px-2.5 py-1 rounded text-xs cursor-pointer ${
              typeFilter === f.key
                ? 'bg-[var(--surface-hover)] text-[var(--text)] font-medium'
                : 'text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-1 text-xs text-[var(--muted)]">
          {visibleTasks.length} tareas
        </span>
      </div>

      <nav className="flex gap-1 mb-4 border-b border-[var(--border)]">
        <button
          onClick={() => setView('board')}
          className={`px-4 py-2 text-sm -mb-px border-b-2 ${
            view === 'board'
              ? 'border-[var(--text)] text-[var(--text)]'
              : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          Tablero
        </button>
        <button
          onClick={() => setView('calendar')}
          className={`px-4 py-2 text-sm -mb-px border-b-2 ${
            view === 'calendar'
              ? 'border-[var(--text)] text-[var(--text)]'
              : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          Calendario
        </button>
      </nav>

      {view === 'board' ? (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
            {STATUSES.map((col) => (
              <Column
                key={col.key}
                status={col.key}
                label={col.label}
                tasks={visibleTasks.filter((t) => t.status === col.key)}
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
        <TaskCalendar tasks={visibleTasks} onSelect={setSelectedTask} onMove={moveDueDate} />
      )}

      <TaskDetailModal
        task={selectedTask}
        allTasks={tasks}
        onClose={() => setSelectedTask(null)}
        onUpdated={(data) => mergeUpdated(data)}
        onDeleted={(id) => setTasks((t) => t.filter((x) => x.id !== id))}
        onSelectTask={setSelectedTask}
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

  // Agrupa visualmente: padre primero, después sus subtareas (de esta columna),
  // luego huérfanos (subtareas cuyo padre está en otra columna), luego standalone.
  const ordered = orderForColumn(tasks, allTasks);

  return (
    <div className="border border-[var(--border)]">
      <h3 className="px-3 py-2 text-sm font-semibold text-[var(--muted)] border-b border-[var(--border)]">
        {label} · {tasks.length}
      </h3>
      <div
        ref={setNodeRef}
        className={`p-2 space-y-2 min-h-[120px] transition-colors ${
          isOver ? 'bg-[var(--surface-hover)]' : ''
        }`}
      >
        {ordered.map((t) => {
          const parent = t.parent_id
            ? allTasks.find((x) => x.id === t.parent_id) ?? null
            : null;
          return (
            <Card
              key={t.id}
              task={t}
              parent={parent}
              parentInSameColumn={parent ? parent.status === status : false}
              onRemove={onRemove}
              onSelect={onSelect}
              subtaskCount={allTasks.filter((x) => x.parent_id === t.id).length}
            />
          );
        })}
      </div>
    </div>
  );
}

function orderForColumn(tasksInCol: Task[], allTasks: Task[]): Task[] {
  const inColIds = new Set(tasksInCol.map((t) => t.id));
  const visited = new Set<string>();
  const out: Task[] = [];

  const childrenOf = (id: string) =>
    tasksInCol.filter((t) => t.parent_id === id);

  for (const t of tasksInCol) {
    if (visited.has(t.id)) continue;
    const parentInCol = t.parent_id ? inColIds.has(t.parent_id) : false;
    if (parentInCol) continue; // se renderiza bajo su padre

    out.push(t);
    visited.add(t.id);
    for (const child of childrenOf(t.id)) {
      if (visited.has(child.id)) continue;
      out.push(child);
      visited.add(child.id);
    }
  }
  // Huérfanos (subtareas cuyo padre no está en esta columna)
  for (const t of tasksInCol) {
    if (!visited.has(t.id)) {
      out.push(t);
      visited.add(t.id);
    }
  }
  return out;
}

function Card({
  task,
  parent = null,
  parentInSameColumn = false,
  onRemove,
  onSelect,
  dragging = false,
  subtaskCount = 0,
}: {
  task: Task;
  parent?: Task | null;
  parentInSameColumn?: boolean;
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
      className={`bg-[var(--surface)] border-l-2 p-2 group cursor-grab active:cursor-grabbing select-none touch-none ${
        isDragging && !dragging ? 'opacity-30' : ''
      } ${dragging ? 'shadow-lg ring-1 ring-[var(--accent)]' : ''} ${
        parentInSameColumn ? 'ml-4' : ''
      }`}
      style={{ borderColor: PRIORITY_COLOR[task.priority] }}
    >
      {parent && !parentInSameColumn && (
        <div className="text-[10px] mono text-[var(--muted)] truncate mb-0.5">
          de: <span className="text-[var(--text)]">{parent.title}</span>
        </div>
      )}
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
      {(task.due_date || task.type !== 'otro') && (
        <div className="flex items-center gap-2 mt-0.5">
          {task.due_date && (
            <span className="mono text-xs text-[var(--muted)]">{task.due_date}</span>
          )}
          {task.type !== 'otro' && (
            <span
              className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{ background: TYPE_STYLE[task.type].bg, color: TYPE_STYLE[task.type].text }}
            >
              {TYPE_STYLE[task.type].label}
            </span>
          )}
        </div>
      )}
    </article>
  );
}
