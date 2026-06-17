'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Task } from '@/lib/types';

type Noti = {
  id: string;
  kind: 'overdue' | 'today' | 'deadline';
  title: string;
  detail: string;
};

const KIND_STYLE: Record<Noti['kind'], { color: string; label: string }> = {
  overdue: { color: 'var(--danger)', label: 'Vencida' },
  today: { color: 'var(--warn)', label: 'Vence hoy' },
  deadline: { color: 'var(--accent)', label: 'Límite cercano' },
};

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Campana de notificaciones: avisa de tareas que vencen hoy o están vencidas. */
export default function NotificationsButton({ tasks }: { tasks: Task[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const notis = useMemo<Noti[]>(() => {
    const today = ymd(new Date());
    const in2 = ymd(new Date(Date.now() + 2 * 86_400_000));
    const out: Noti[] = [];
    for (const t of tasks) {
      if (t.status === 'done') continue;
      if (t.due_date && t.due_date < today) {
        out.push({ id: `${t.id}-ov`, kind: 'overdue', title: t.title, detail: `programada ${t.due_date}` });
      } else if (t.due_date === today) {
        out.push({ id: `${t.id}-td`, kind: 'today', title: t.title, detail: 'programada para hoy' });
      }
      if (t.deadline && t.deadline >= today && t.deadline <= in2) {
        out.push({ id: `${t.id}-dl`, kind: 'deadline', title: t.title, detail: `límite ${t.deadline}` });
      }
    }
    // vencidas primero, luego hoy, luego límites
    const order = { overdue: 0, today: 1, deadline: 2 };
    return out.sort((a, b) => order[a.kind] - order[b.kind]);
  }, [tasks]);

  const count = notis.length;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="fixed bottom-6 right-24 z-40">
      {open && (
        <div className="absolute bottom-16 right-0 w-80 sm:w-96 max-h-[70vh] overflow-y-auto bg-white border border-[var(--border)] rounded-xl shadow-2xl p-4 animate-[fadeIn_0.15s_ease-out]">
          <h2 className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium mb-3">
            Notificaciones
          </h2>
          {count === 0 ? (
            <span className="text-sm text-[var(--muted)]">
              Sin notificaciones. Estás al día. ✨
            </span>
          ) : (
            <ul className="space-y-2">
              {notis.map((n) => (
                <li key={n.id} className="flex items-start gap-2.5">
                  <span
                    className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: KIND_STYLE[n.kind].color }}
                  />
                  <div className="min-w-0">
                    <div className="text-sm text-[var(--text)] truncate">{n.title}</div>
                    <div className="text-xs text-[var(--muted)]">
                      <span style={{ color: KIND_STYLE[n.kind].color }}>
                        {KIND_STYLE[n.kind].label}
                      </span>{' '}
                      · {n.detail}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        title="Notificaciones"
        aria-label="Notificaciones"
        className={`relative w-14 h-14 rounded-full bg-white border border-[var(--border)] shadow-lg flex items-center justify-center text-2xl hover:shadow-xl transition-shadow ${
          open ? '' : 'animate-[levitate_3s_ease-in-out_infinite]'
        }`}
      >
        🔔
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-[var(--danger)] text-white text-[11px] font-semibold flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
    </div>
  );
}
