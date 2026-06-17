/**
 * Middleware de autenticación (corre en el edge para todas las rutas).
 *
 * Es el guardia central de la app: deja pasar rutas públicas (`/login`,
 * `/api/auth/*`), permite los endpoints de cron con el header
 * `Authorization: Bearer CRON_SECRET` (acceso server-to-server) y redirige a
 * `/login` cualquier otra petición sin sesión. Por eso las rutas API no
 * vuelven a llamar a `auth()`: la protección vive aquí.
 */
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const path = nextUrl.pathname;

  const isPublic =
    path === '/login' ||
    path.startsWith('/api/auth') ||
    path === '/favicon.ico';

  // Allow cron / scheduled endpoints with a shared secret (server-to-server)
  const isCron =
    path.startsWith('/api/summary') ||
    path.startsWith('/api/news') ||
    path.startsWith('/api/github') ||
    path.startsWith('/api/notes/sync');
  const cronSecret = process.env.CRON_SECRET;
  if (isCron && cronSecret) {
    const header = req.headers.get('authorization');
    if (header === `Bearer ${cronSecret}`) return NextResponse.next();
  }

  if (isPublic) return NextResponse.next();

  if (!isLoggedIn) {
    const url = new URL('/login', nextUrl);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)'],
};
