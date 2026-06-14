import { NextRequest, NextResponse } from 'next/server';
import { db, sistemas } from '@/db';
import { asc } from 'drizzle-orm';
import { suggestAccionPasos } from '@/lib/sistemas-ai';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const titulo = typeof body.titulo === 'string' ? body.titulo : '';
    if (!titulo.trim()) {
      return NextResponse.json({ error: 'titulo requerido' }, { status: 400 });
    }

    const rows = await db
      .select()
      .from(sistemas)
      .orderBy(asc(sistemas.orden), asc(sistemas.nombre));

    const pasos = await suggestAccionPasos(
      {
        titulo,
        contenido: typeof body.contenido === 'string' ? body.contenido : null,
        sistemaInicial:
          typeof body.sistemaInicial === 'string' ? body.sistemaInicial : null,
      },
      rows,
    );

    return NextResponse.json({ pasos });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
