'use client';

import { useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { Session } from 'next-auth';
import type { Task } from '@/lib/types';
import Topbar from './Topbar';
import Sidebar from './Sidebar';
import NotificationsButton from './NotificationsButton';
import DailySummary from './DailySummary';
import AiLottieButton from './AiLottieButton';
import TaskPlannerModal from './TaskPlannerModal';
import KoAiChat from './KoAiChat';
import SistemasAiChat from './SistemasAiChat';

/** GUITO es contextual: según la sección activa abre un asistente distinto. */
type GuitoContext = 'ko' | 'sistemas' | 'task';

function guitoContextFor(pathname: string | null): GuitoContext {
  if (pathname?.startsWith('/ko')) return 'ko';
  if (pathname?.startsWith('/sistemas')) return 'sistemas';
  return 'task';
}

/**
 * Layout global de la app: Topbar + Sidebar + contenido + botones flotantes.
 * Monta el GUITO contextual ({@link guitoContextFor}): en `/ko` abre el chat KO,
 * en `/sistemas` el de Sistemas, y en el resto el planner de tareas.
 */
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
  const [guitoOpen, setGuitoOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const context = guitoContextFor(pathname);

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

      {/* Botones flotantes globales (presentes en TODAS las páginas) */}
      <NotificationsButton tasks={tasks} />
      <DailySummary />

      {/* Botón flotante GUITO: contextual según la sección activa
          (KO → asistente de KO, Sistemas → asistente de Sistemas, resto → nueva tarea). */}
      <AiLottieButton
        onClick={() => setGuitoOpen(true)}
        paused={guitoOpen}
        title={
          context === 'ko'
            ? 'Asistente de KO'
            : context === 'sistemas'
              ? 'Asistente de Sistemas'
              : 'Nueva tarea con IA'
        }
      />

      {context === 'task' && (
        <TaskPlannerModal
          open={guitoOpen}
          onClose={() => setGuitoOpen(false)}
          onCreated={() => {
            setGuitoOpen(false);
            router.refresh();
          }}
        />
      )}
      {context === 'ko' && (
        <KoAiChat open={guitoOpen} onClose={() => setGuitoOpen(false)} />
      )}
      {context === 'sistemas' && (
        <SistemasAiChat open={guitoOpen} onClose={() => setGuitoOpen(false)} />
      )}
    </>
  );
}
