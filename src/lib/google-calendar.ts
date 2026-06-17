/**
 * Sincronización de tareas con Google Calendar (calendario `primary`).
 *
 * Usa el `accessToken` de Google guardado en la sesión NextAuth para crear o
 * borrar eventos a partir de una tarea. Una tarea se vuelve un evento de día
 * completo en su `due_date`.
 */
import { auth } from '@/auth';
import type { Task } from '@/lib/types';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

/** Obtiene el access token de Google desde la sesión. @throws si no hay sesión/token. */
async function getAccessToken(): Promise<string> {
  const session = (await auth()) as ({ accessToken?: string } | null);
  const token = session?.accessToken;
  if (!token) throw new Error('Sin token de Google. Vuelve a iniciar sesión.');
  return token;
}

/** Arma el cuerpo del evento (día completo) a partir de la tarea. @throws si falta `due_date`. */
function buildEventBody(task: Task) {
  if (!task.due_date) {
    throw new Error('La tarea no tiene fecha programada (due_date).');
  }
  return {
    summary: task.title,
    description: [
      task.description ?? '',
      task.deadline ? `\nFecha límite: ${task.deadline}` : '',
      task.tags?.length ? `\nTags: ${task.tags.join(', ')}` : '',
      `\nPrioridad: ${task.priority}`,
    ]
      .join('')
      .trim(),
    start: { date: task.due_date },
    end: { date: task.due_date },
    reminders: { useDefault: true },
  };
}

/**
 * Crea un evento en Google Calendar a partir de una tarea.
 * @returns El `id` del evento creado y su `htmlLink`.
 */
export async function createCalendarEventFromTask(task: Task): Promise<{
  id: string;
  htmlLink: string;
}> {
  const token = await getAccessToken();
  const res = await fetch(CALENDAR_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildEventBody(task)),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google Calendar API ${res.status}: ${txt}`);
  }
  const data = (await res.json()) as { id: string; htmlLink: string };
  return { id: data.id, htmlLink: data.htmlLink };
}

/** Borra un evento por id; trata 404/410 (ya no existe) como éxito idempotente. */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`${CALENDAR_API}/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const txt = await res.text();
    throw new Error(`Google Calendar API ${res.status}: ${txt}`);
  }
}
