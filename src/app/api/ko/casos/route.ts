/**
 * API REST de los casos importados (colección).
 * - GET /api/ko/casos → lista los casos, filtrable por `?tipo=`, `?estado=` y
 *   `?lote=`. Orden por fecha de importación (más recientes primero).
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, ko_import_casos } from '@/db';
import { and, desc, eq, type SQL } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get('tipo');
    const estado = searchParams.get('estado');
    const lote = searchParams.get('lote');

    const filtros: SQL[] = [];
    if (tipo === 'conocida' || tipo === 'desconocida') {
      filtros.push(eq(ko_import_casos.tipo, tipo));
    }
    if (estado === 'pendiente' || estado === 'resuelto') {
      filtros.push(eq(ko_import_casos.estado, estado));
    }
    if (lote) {
      filtros.push(eq(ko_import_casos.lote_id, lote));
    }

    const rows = await db
      .select()
      .from(ko_import_casos)
      .where(filtros.length ? and(...filtros) : undefined)
      .orderBy(desc(ko_import_casos.created_at));

    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
