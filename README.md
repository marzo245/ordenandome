# Calendario Inteligente

Gestión de tareas (tablero por estado) + contexto de GitHub + resumen diario por IA (Groq).
Single-user: tú. Token personal de GitHub, sin OAuth.

## Stack
- Next.js 15 (App Router) — UI + API routes (las keys viven server-side).
- Supabase (Postgres) — tareas, cache de actividad GitHub, resúmenes.
- Octokit — commits + PRs vía Search API.
- Groq (`llama-3.3-70b-versatile`) — resumen diario accionable.
- Vercel + Vercel Cron — deploy y resumen automático a las 23:00.

## Setup local
```bash
npm install
cp .env.example .env.local   # rellena tus valores
```

1. Crea un proyecto en Supabase y corre `supabase/schema.sql` en el SQL Editor.
2. Genera un GitHub PAT (scopes: `repo`, `read:user`).
3. Saca tu API key de Groq.
4. Rellena `.env.local`.

```bash
npm run dev   # http://localhost:3000
```

## Despliegue (Render + CI/CD)

### 1. Crear los servicios en Render
- New + → **Blueprint** → selecciona este repo. `render.yaml` crea:
  - **web** `calendario-inteligente` (Next.js, plan free, `autoDeploy: false`).
  - **cron** `resumen-diario` (23:00 UTC) que pega `GET /api/summary` con el
    `CRON_SECRET` y regenera el resumen (de paso despierta la app del free tier).
- Completa las env vars marcadas `sync: false` (Supabase, GitHub, Groq).
- En el cron, pon `APP_URL` = la URL pública del web service
  (`https://calendario-inteligente.onrender.com`).

### 2. CI/CD con GitHub Actions
El pipeline (`.github/workflows/ci-cd.yml`) es la única puerta al deploy:
- **PR y push**: `npm ci` → lint → `tsc --noEmit` → `next build`.
- **push a `main`** (si CI pasa): dispara el **Deploy Hook** de Render.

Setup (una vez):
1. En Render → web service → **Settings → Deploy Hook** → copia la URL.
2. En GitHub → repo → **Settings → Secrets and variables → Actions** →
   nuevo secret `RENDER_DEPLOY_HOOK_URL` con esa URL.
3. Render con `autoDeploy: false` no despliega solo: Actions manda.

> Free tier: el web service hiberna tras ~15 min de inactividad; la primera
> request tras dormir tarda ~50s. El cron diario lo despierta solo; si quieres
> que esté siempre vivo, añade otro cron de keep-alive (`*/14 * * * *`) pegando a `/`.

## Flujo
- **Tareas**: tablero `todo → doing → done`. Al pasar a `done` se sella `completed_at`.
- **GitHub**: `GET /api/github/sync?days=7` cachea actividad. El resumen también
  refresca el día actual al generarse.
- **Resumen**: botón «regenerar» (POST) o cron diario (GET autorizado).

## Endpoints
| Método | Ruta | Acción |
|---|---|---|
| GET/POST | `/api/tasks` | listar / crear |
| PATCH/DELETE | `/api/tasks/[id]` | actualizar / borrar |
| GET | `/api/github/sync?days=N` | sincronizar GitHub |
| GET | `/api/summary` | leer resumen del día (cron: regenera) |
| POST | `/api/summary` | regenerar resumen |

## Pendiente / siguientes pasos
- **Auth**: si lo expones públicamente, añade un gate. Lo más rápido: middleware
  con una password en env, o Supabase Auth + RLS si luego quieres multi-usuario.
- Vista calendario mensual (hoy es tablero kanban).
- Drag & drop entre columnas.
