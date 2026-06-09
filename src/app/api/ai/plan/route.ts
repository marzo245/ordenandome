import { NextRequest, NextResponse } from 'next/server';
import { db, tasks } from '@/db';
import { planTask, type ChatMessage } from '@/lib/groq-planner';

export async function POST(req: NextRequest) {
  try {
    const { messages } = (await req.json()) as { messages: ChatMessage[] };

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages requerido' }, { status: 400 });
    }

    const currentTasks = await db.select().from(tasks);
    const result = await planTask(messages, currentTasks);

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
