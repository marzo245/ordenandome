import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

const ALLOWED_EMAIL = 'diegochicuazuque@gmail.com';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const SCOPES = ['openid', 'email', 'profile', CALENDAR_SCOPE].join(' ');

async function refreshGoogleToken(refreshToken: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
  return (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: SCOPES,
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async signIn({ profile }) {
      return profile?.email?.toLowerCase() === ALLOWED_EMAIL;
    },
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 3600 * 1000;
        return token;
      }
      if (
        typeof token.accessTokenExpires === 'number' &&
        Date.now() < token.accessTokenExpires - 60_000
      ) {
        return token;
      }
      if (!token.refreshToken) return token;
      try {
        const refreshed = await refreshGoogleToken(token.refreshToken as string);
        token.accessToken = refreshed.access_token;
        token.accessTokenExpires = Date.now() + refreshed.expires_in * 1000;
        if (refreshed.refresh_token) token.refreshToken = refreshed.refresh_token;
      } catch {
        token.error = 'RefreshAccessTokenError';
      }
      return token;
    },
    async session({ session, token }) {
      (session as { accessToken?: string }).accessToken =
        token.accessToken as string | undefined;
      return session;
    },
  },
  session: { strategy: 'jwt' },
  trustHost: true,
});
