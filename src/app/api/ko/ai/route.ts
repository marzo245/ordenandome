import { NextRequest, NextResponse } from 'next/server';
import { db, ko_entries } from '@/db';
import { asc } from 'drizzle-orm';
import { koAssistant } from '@/lib/ko-ai';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { messages } = (await req.json()) as {
      messages: { role: 'user' | 'assistant'; content: string }[];
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages requerido' }, { status: 400 });
    }

    const entries = await db
      .select()
      .from(ko_entries)
      .orderBy(asc(ko_entries.codigo));

    const result = await koAssistant(messages, entries);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
