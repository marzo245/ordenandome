# Calendario Inteligente

App personal estilo Notion: tareas, notas (Obsidian), noticias por nicho, actividad de GitHub, resumen diario por IA y dos bases de conocimiento operativas (**KO** y **Sistemas**), con asistentes de IA y la mascota **GUITO**.

## Funcionalidades

- **Hoy** — tablero de tareas (`todo → doing → done`) con planner por IA.
- **Notas** — vault de Obsidian (repo GitHub) con enlaces entre notas y edición por IA.
- **Noticias** — feed agregado por nichos.
- **GitHub** — actividad reciente (commits + PRs).
- **KO** — base de errores conocidos del flujo Enel (catálogo + subprocesos), con asistente IA.
- **Sistemas** — documentación de cada sistema (OPERA, eCO, Salesforce, ForceBeat, Beats, SAP) y las **acciones** que se pueden hacer en cada uno, incluido el **flujo multi-sistema** (empiezas en un sistema, sacas un dato y vas al siguiente). Asistente IA que crea/edita sistemas y acciones y acepta capturas de pantalla.
- **GUITO** — mascota Lottie contextual: en cada sección abre el asistente correspondiente.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript** — UI + API routes (las keys viven server-side).
- **Neon Postgres** + **Drizzle ORM** — tareas, notas, KO, sistemas, cache de GitHub, resúmenes.
- **NextAuth v5 + Google OAuth** — autenticación.
- IA dual: **Groq** (`llama-3.3-70b`, rápido, default) y **Gemini** (`gemini-2.5-flash`, razonamiento profundo y multimodal/visión).
- **Octokit** — actividad de GitHub. **Obsidian** vía repo GitHub.
- **Render** — deploy (auto-deploy en push a `main`). Cron del resumen en cron-job.org.

## Setup local

```bash
npm install
cp .env.example .env.local   # rellena tus valores
```

1. Crea una base **Neon** (Postgres) y corre `supabase/schema.sql` contra ella (el archivo es el DDL; el nombre es histórico). Para sincronizar cambios de schema luego: `npm run db:push`.
2. Configura **Google OAuth** (client id/secret) y genera `AUTH_SECRET` con `npx auth secret`.
3. GitHub PAT (scopes `repo`, `read:user`) y API keys de Groq y Gemini.
4. Rellena `.env.local` (ver `.env.example` para la lista completa).

```bash
npm run dev   # http://localhost:3000
```

## Comandos

```bash
npm run dev          # desarrollo
npm run build        # next build (corre ESLint + type-check)
npm run lint         # next lint
npm run db:push      # sincroniza schema.ts → Neon
npm run db:studio    # drizzle studio
```

> ⚠️ **Antes de pushear:** `next build` corre ESLint y los errores **rompen el deploy**. `tsc --noEmit` no basta. Corre `npx next lint` antes de hacer push.

## Despliegue (Render)

`render.yaml` define el web service (`autoDeploy: true`, branch `main`, `npm ci && npm run build` → `npm start`, healthcheck `/`, Node 20.18.0). **Cada push a `main` despliega automáticamente.**

- Importa el repo en Render → New + → **Blueprint**.
- Completa las env vars `sync: false` (`DATABASE_URL`, GitHub, Groq) y añade en el dashboard las que no están en el blueprint: `GEMINI_API_KEY`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `NEXTAUTH_URL`, `OBSIDIAN_VAULT_*`, `IMGBB_API_KEY` (opcional).
- **Resumen diario**: configura en cron-job.org un `GET $APP_URL/api/summary` con header `Authorization: Bearer $CRON_SECRET` (Render quitó el cron del plan free). De paso despierta la app del free tier.

> Free tier: el web service hiberna tras ~15 min; la primera request tras dormir tarda ~50s.

## Base de datos

- Conexión vía `DATABASE_URL` (Neon) en `src/db/index.ts`. Schema en `src/db/schema.ts`; DDL espejo en `supabase/schema.sql`.
- El schema **no se aplica solo**: tras editar `schema.ts`, aplica el cambio a Neon (`npm run db:push` o el `ALTER/CREATE` directo). Si falta una tabla/columna, la página falla con `Failed query`.
- Nota: el conector MCP de Supabase apunta a otro proyecto; la DB real de la app es Neon.

## Endpoints (principales)

| Método | Ruta | Acción |
|---|---|---|
| GET/POST | `/api/tasks` · `/api/tasks/[id]` | tareas |
| GET/POST/PATCH/DELETE | `/api/ko` · `/api/ko/subprocesos` | base KO |
| GET/POST/PATCH/DELETE | `/api/sistemas` · `/api/sistemas/secciones` | sistemas y acciones |
| POST | `/api/ko/ai` · `/api/sistemas/ai` · `/api/ai` | asistentes IA |
| GET | `/api/github/sync?days=N` | sincronizar GitHub |
| GET/POST | `/api/summary` | leer (cron regenera) / regenerar resumen |
| GET/POST | `/api/notes` · `/api/notes/upload-image` | notas Obsidian + subida de imágenes |
| GET | `/api/news` | feed de noticias |

## Convenciones

- UI y comentarios en **español**.
- Commits van directo a `main`; el push dispara el deploy en Render.
- Más detalle de arquitectura y patrones de IA en [`CLAUDE.md`](./CLAUDE.md).
