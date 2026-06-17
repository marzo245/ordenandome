'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from 'next-auth';

/** Menú desplegable del usuario (avatar/nombre + acciones, p. ej. cerrar sesión). */
export default function UserMenu({
  session,
  children,
}: {
  session: Session;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const user = session.user;
  if (!user) return null;

  const name = user.name ?? user.email ?? 'Usuario';
  const initial = (name.trim()[0] ?? '?').toUpperCase();

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center w-7 h-7 rounded-full overflow-hidden border border-[var(--border)] bg-[var(--surface)] hover:opacity-90"
        aria-label="Menú de usuario"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt={name}
            width={28}
            height={28}
            className="w-7 h-7 object-cover"
          />
        ) : (
          <span className="text-xs text-[var(--muted)]">{initial}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-72 border border-[var(--border)] bg-[var(--surface)] shadow-xl p-3 z-40">
          {user.email && (
            <div className="text-[var(--muted)] text-xs truncate">
              {user.email}
            </div>
          )}
          <div className="font-medium text-sm truncate">{name}</div>
          <hr className="my-2 border-[var(--border)]" />
          <div className="px-2 py-1.5 text-sm text-[var(--muted)] cursor-not-allowed">
            Settings
          </div>
          <hr className="my-2 border-[var(--border)]" />
          {children}
        </div>
      )}
    </div>
  );
}
