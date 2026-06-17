/**
 * Endpoint catch-all de NextAuth (`/api/auth/*`): login, callback, sesión, etc.
 * Reexporta los handlers GET/POST generados a partir de la config en `@/auth`.
 */
import { handlers } from '@/auth';
export const { GET, POST } = handlers;
