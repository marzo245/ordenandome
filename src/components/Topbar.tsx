import type { Session } from 'next-auth';
import type { ReactNode } from 'react';
import UserMenu from './UserMenu';

export default function Topbar({
  session,
  onMenuClick,
  logoutSlot,
}: {
  session: Session | null;
  onMenuClick: () => void;
  logoutSlot?: ReactNode;
}) {
  const dateLabel = new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).format(new Date());

  return (
    <header className="fixed top-0 inset-x-0 h-12 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur z-30">
      <div className="h-full flex items-center px-3 sm:px-4 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onMenuClick}
            className="lg:hidden p-1.5 -ml-1.5 text-[var(--muted)] hover:text-[var(--text)]"
            aria-label="Abrir menú"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="font-medium text-sm truncate">
            Calendario Inteligente
          </span>
        </div>

        <div className="flex-1 flex justify-center">
          <span className="text-xs text-[var(--muted)] hidden sm:inline capitalize">
            {dateLabel}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/notes"
            className="text-sm text-[var(--muted)] hover:text-[var(--text)] hover:underline"
          >
            Notas
          </a>
          {session && <UserMenu session={session}>{logoutSlot}</UserMenu>}
        </div>
      </div>
    </header>
  );
}
