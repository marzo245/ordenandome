'use client';

import { useState, type ReactNode } from 'react';
import type { Session } from 'next-auth';
import type { Task } from '@/lib/types';
import Topbar from './Topbar';
import Sidebar from './Sidebar';

export default function DashboardShell({
  session,
  logoutSlot,
  tasks,
  children,
}: {
  session: Session | null;
  logoutSlot?: ReactNode;
  tasks: Task[];
  children: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <Topbar
        session={session}
        onMenuClick={() => setSidebarOpen(true)}
        logoutSlot={logoutSlot}
      />
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        tasks={tasks}
      />
      <main className="lg:pl-60 pt-12">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {children}
        </div>
      </main>
    </>
  );
}
