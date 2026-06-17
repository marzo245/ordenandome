/**
 * Feed de noticias técnicas por nicho.
 * - GET /api/news       → `{ items }` ordenados.
 * - GET /api/news?debug → además conteo por fuente y errores.
 *   `force-dynamic`: nunca se cachea. Accesible también vía CRON_SECRET (ver middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchNewsWithDebug } from '@/lib/news';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const debug = req.nextUrl.searchParams.has('debug');
  try {
    const result = await fetchNewsWithDebug();
    if (debug) {
      return NextResponse.json(result);
    }
    return NextResponse.json({ items: result.items });
  } catch (e) {
    console.error('[/api/news] error:', e);
    return NextResponse.json(
      { items: [], error: (e as Error).message },
      { status: 500 }
    );
  }
}
