/**
 * Endpoint del planner de tareas (GUITO).
 * - POST /api/ai/plan → recibe `{ messages }`, carga tareas + mapa del vault
 *   como contexto y devuelve un `PlannerResult` (clarify / propose / propose_multi).
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, tasks } from '@/db';
import { planTask, type ChatMessage } from '@/lib/groq-planner';
import { buildVaultMap } from '@/lib/vault-context';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { messages } = (await req.json()) as { messages: ChatMessage[] };

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages requerido' }, { status: 400 });
    }

    const [currentTasks, vaultMap] = await Promise.all([
      db.select().from(tasks),
      buildVaultMap(),
    ]);

    const result = await planTask(messages, currentTasks, vaultMap);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
