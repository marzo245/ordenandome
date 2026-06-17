import { signOut } from '@/auth';

/** Botón que cierra la sesión vía server action (NextAuth `signOut`) y redirige a /login. */
export default function LogoutButton() {
  return (
    <form
      action={async () => {
        'use server';
        await signOut({ redirectTo: '/login' });
      }}
    >
      <button
        type="submit"
        className="text-sm text-[var(--text)] hover:text-[var(--danger)] w-full text-left"
      >
        Cerrar sesión
      </button>
    </form>
  );
}
