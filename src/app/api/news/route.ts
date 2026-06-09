import { NextResponse } from 'next/server';
import { fetchNews } from '@/lib/news';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const items = await fetchNews();
    return NextResponse.json({ items });
  } catch (e) {
    console.error('[/api/news] error:', e);
    return NextResponse.json(
      { items: [], error: (e as Error).message },
      { status: 500 }
    );
  }
}
