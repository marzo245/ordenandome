import { signIn, auth } from '@/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session) redirect('/');
  const sp = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm border border-[var(--border)] rounded-lg p-6 sm:p-8 bg-[var(--surface)] shadow-xl">
        <h1 className="text-xl sm:text-2xl font-semibold mb-2">
          Calendario <span className="text-[var(--muted)]">Inteligente</span>
        </h1>
        <p className="text-sm text-[var(--muted)] mb-6">
          Acceso restringido. Inicia sesión con tu cuenta autorizada.
        </p>

        {sp?.error && (
          <div className="mb-4 text-xs sm:text-sm text-[var(--danger)] border border-[var(--danger)]/30 bg-[var(--danger)]/10 rounded px-3 py-2">
            {sp.error === 'AccessDenied'
              ? 'Esta cuenta de Google no está autorizada.'
              : 'No se pudo iniciar sesión. Intenta de nuevo.'}
          </div>
        )}

        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: sp?.callbackUrl ?? '/' });
          }}
        >
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-white text-black hover:bg-gray-100 transition px-4 py-2 text-sm font-medium"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.1 29.3 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.3-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.1 29.3 3 24 3 16.1 3 9.3 7.6 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 45c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.3-7.2 2.3-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.2 40.4 16 45 24 45z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C41.9 35.1 45 30 45 24c0-1.2-.1-2.3-.4-3.5z" />
            </svg>
            Continuar con Google
          </button>
        </form>
      </div>
    </main>
  );
}
