'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Task } from '@/lib/types';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  tasks: Task[];
}

const NAV_ITEMS = [
  { href: '/', icon: '📅', label: 'Hoy' },
  { href: '/notes', icon: '📝', label: 'Notas' },
  { href: '/noticias', icon: '📰', label: 'Noticias' },
  { href: '/github', icon: '🐙', label: 'GitHub' },
  { href: '/ko', icon: '🧠', label: 'KO' },
  { href: '/sistemas', icon: '🖥️', label: 'Sistemas' },
];

const MAX_PARENTS = 15;
const MAX_STANDALONE = 15;

function TaskTitle({ task }: { task: Task }) {
  const done = task.status === 'done';
  return (
    <span
      className={`truncate ${done ? 'line-through opacity-50' : ''}`}
      title={task.title}
    >
      {task.title}
    </span>
  );
}

function SidebarContent({
  tasks,
  onClose,
}: {
  tasks: Task[];
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const parents = tasks
    .filter((t) => !t.parent_id && tasks.some((s) => s.parent_id === t.id))
    .slice(0, MAX_PARENTS);
  const allParents = tasks.filter(
    (t) => !t.parent_id && tasks.some((s) => s.parent_id === t.id),
  );
  const standaloneAll = tasks.filter(
    (t) => !t.parent_id && !tasks.some((s) => s.parent_id === t.id),
  );
  const standalone = standaloneAll.slice(0, MAX_STANDALONE);
  const childrenOf = (id: string) =>
    tasks.filter((t) => t.parent_id === id);

  const extraParents = Math.max(0, allParents.length - parents.length);
  const extraStandalone = Math.max(0, standaloneAll.length - standalone.length);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  }

  const itemBase =
    'px-2 py-1 rounded text-sm text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)] cursor-pointer flex items-center gap-1.5';
  const itemActive = 'bg-[var(--surface)] text-[var(--text)]';

  return (
    <div className="px-2 py-3 flex flex-col h-full overflow-y-auto">
      {/* Workspace header */}
      <div className="px-2 py-2 mb-3 flex items-center justify-between text-sm font-medium hover:bg-[var(--surface)] rounded cursor-pointer">
        <span className="truncate">Calendario Inteligente</span>
        <span className="text-xs text-[var(--muted)]">⌄</span>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Buscar..."
        className="w-full bg-[var(--surface)] border-0 rounded px-2 py-1 text-xs placeholder:text-[var(--muted)] mb-3"
      />

      {/* Navegación de primer nivel */}
      <div className="flex flex-col">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className={`${itemBase} ${isActive(item.href) ? itemActive : ''}`}
          >
            <span className="w-3 flex-shrink-0" />
            <span>{item.icon}</span>
            <span className="truncate">{item.label}</span>
          </Link>
        ))}
      </div>

      {/* Divider */}
      <div className="border-t border-[var(--border)] my-3" />

      {/* TAREAS section */}
      <div className="px-2 mt-4 mb-1 text-[10px] uppercase tracking-wider text-[var(--muted)] font-medium">
        Tareas
      </div>

      <div className="flex flex-col">
        {parents.map((parent) => {
          const isOpen = expanded.has(parent.id);
          const kids = childrenOf(parent.id);
          return (
            <div key={parent.id} className="flex flex-col">
              <div className={itemBase}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(parent.id);
                  }}
                  className="text-xs text-[var(--muted)] w-3 flex-shrink-0 hover:text-[var(--text)]"
                  aria-label={isOpen ? 'Colapsar' : 'Expandir'}
                >
                  {isOpen ? '▾' : '▸'}
                </button>
                <Link
                  href="/"
                  onClick={onClose}
                  className="flex-1 min-w-0 flex items-center"
                >
                  <TaskTitle task={parent} />
                </Link>
              </div>
              {isOpen && (
                <div className="flex flex-col">
                  {kids.map((child) => (
                    <Link
                      key={child.id}
                      href="/"
                      onClick={onClose}
                      className={`${itemBase} pl-6`}
                    >
                      <span className="text-xs text-[var(--muted)]">↳</span>
                      <TaskTitle task={child} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {standalone.map((task) => (
          <Link
            key={task.id}
            href="/"
            onClick={onClose}
            className={itemBase}
          >
            <span className="text-xs text-[var(--muted)] w-3 flex-shrink-0 text-center">
              ·
            </span>
            <TaskTitle task={task} />
          </Link>
        ))}

        {(extraParents > 0 || extraStandalone > 0) && (
          <div className="text-xs text-[var(--muted)] px-2 mt-1">
            + {extraParents + extraStandalone} más
          </div>
        )}

        {parents.length === 0 && standalone.length === 0 && (
          <div className="text-xs text-[var(--muted)] px-2 mt-1">
            Sin tareas
          </div>
        )}
      </div>
    </div>
  );
}

export default function Sidebar({ open, onClose, tasks }: SidebarProps) {
  return (
    <>
      {/* Desktop */}
      <aside className="hidden lg:block fixed top-12 left-0 bottom-0 w-60 border-r border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
        <SidebarContent tasks={tasks} />
      </aside>

      {/* Mobile */}
      {open && (
        <div className="lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 z-40"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside className="fixed top-0 left-0 bottom-0 w-72 border-r border-[var(--border)] bg-[var(--bg)] z-50 pt-12">
            <SidebarContent tasks={tasks} onClose={onClose} />
          </aside>
        </div>
      )}
    </>
  );
}
