/**
 * Recomendaciones de libros por nicho (Open Library).
 * - GET /api/books/recommendations → devuelve libros sugeridos + diagnóstico.
 *   `force-dynamic`: nunca se cachea (consulta fuentes externas en vivo).
 */
import { NextResponse } from 'next/server';
import { fetchBookRecommendations } from '@/lib/books';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await fetchBookRecommendations();
    return NextResponse.json(result);
  } catch (e) {
    console.error('[/api/books/recommendations] error:', e);
    return NextResponse.json(
      { items: [], error: (e as Error).message },
      { status: 500 }
    );
  }
}
