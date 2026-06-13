import { auth } from '@/auth';
import type { Task } from '@/lib/types';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

async function getAccessToken(): Promise<string> {
  const session = (await auth()) as ({ accessToken?: string } | null);
  const token = session?.accessToken;
  if (!token) throw new Error('Sin token de Google. Vuelve a iniciar sesión.');
  return token;
}

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
