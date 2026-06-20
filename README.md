<div align="center">

# Calendario Inteligente

**Tu segundo cerebro estilo Notion** — tareas, notas de Obsidian, noticias, actividad de GitHub y dos bases de conocimiento operativas, potenciado con IA y guiado por **GUITO**, una mascota asistente.

<br />

[![Next.js](https://img.shields.io/badge/Next.js_15-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Drizzle](https://img.shields.io/badge/Drizzle_ORM-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black)](https://orm.drizzle.team/)
[![Neon](https://img.shields.io/badge/Neon_Postgres-00E599?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech/)
[![Render](https://img.shields.io/badge/Render-46E3B7?style=for-the-badge&logo=render&logoColor=black)](https://render.com/)

[Funcionalidades](#funcionalidades) · [Arquitectura de IA](#arquitectura-de-ia) · [Setup local](#setup-local) · [Despliegue](#despliegue-render) · [API](#endpoints-principales) · [CLAUDE.md](./CLAUDE.md)

</div>

---

## Funcionalidades

| Sección | Qué hace |
|---|---|
| **Hoy** | Tablero de tareas (`todo → doing → done`) con planner por IA y drag & drop. |
| **Notas** | Vault de Obsidian (repo de GitHub) con enlaces entre notas y edición asistida por IA. |
| **Noticias** | Feed agregado por nichos de interés. |
| **GitHub** | Actividad reciente (commits + PRs) vía Octokit. |
| **KO** | Base de errores conocidos del flujo Enel (catálogo + subprocesos), con asistente IA. Importa el **Excel de KO altas** (hoja `default_1`): cada fila es una cuenta atascada; cruza su **«Error normalizado»** contra el catálogo por contención (todas las filas con el mismo error reciben el mismo veredicto) → las **conocidas** se agrupan por KO en una worklist con su plan de acción (resuelves en lote o una a una), y las **pendientes** se agrupan por error en una bandeja para normalizarlas y promoverlas a KO (todo el grupo de golpe). Buscador en ambas pestañas y lista de importaciones con borrar. |
| **Sistemas** | Documentación de OPERA, eCO, Salesforce, ForceBeat, Beats y SAP, con las **acciones** de cada uno y el **flujo multi-sistema** (empiezas en un sistema, sacas un dato y saltas al siguiente). El asistente crea/edita sistemas y acciones y acepta capturas de pantalla. |
| **GUITO** | Mascota Lottie contextual: en cada sección abre el asistente correspondiente. |
| **Resumen diario** | Generado por IA cada día (vía cron). |

---

## Arquitectura de IA

Toda llamada al LLM pasa por un único núcleo, **`runAgent()`** (`src/lib/ai-agent.ts`), compatible con el formato OpenAI. Dos proveedores:

- **Groq** (`llama-3.3-70b`) — rápido, default, solo texto.
- **Gemini** (`gemini-2.5-flash`) — razonamiento profundo y multimodal / visión.

```
                       429 (cuota)        429 (cuota)
   GROQ_API_KEY  ───────────────▶  GROQ_API_KEY_2  ───────────────▶  Gemini
   (rápido, default)               (failover)                        (último recurso)
```

- **Failover por cuota:** si un proveedor devuelve `429` (límite diario de tokens agotado), `runAgent` salta al siguiente intento de la cadena automáticamente.
- **Reintento transitorio:** ante `503/502/529` (modelo saturado) reintenta el mismo proveedor con backoff y, si persiste, pasa al siguiente.
- **Multimodal:** si un mensaje lleva imágenes, se enruta a Gemini (Groq es solo texto).
- **Asistentes de dominio** (`ko-ai`, `sistemas-ai`, `notes-ai`) devuelven un JSON con un campo `action` (`clarify`, `answer`, `propose_create`, `propose_edit`, …); el cliente renderiza la propuesta y, al confirmar, hace el POST/PATCH real.

Más detalle de patrones de IA y arquitectura en [`CLAUDE.md`](./CLAUDE.md).

---

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript** — UI + API routes (las API keys viven server-side).
- **Neon Postgres** + **Drizzle ORM** — tareas, notas, KO, sistemas, cache de GitHub y resúmenes.
- **NextAuth v5 + Google OAuth** — autenticación.
- IA dual **Groq + Gemini** (ver [Arquitectura de IA](#arquitectura-de-ia)).
- **Octokit** para GitHub, **Obsidian** vía repo de GitHub, **Mermaid** y **react-markdown** para render.
- **Render** — deploy (auto-deploy en push a `main`); cron del resumen en cron-job.org.

---

## Estructura

```
src/
├─ app/
│  ├─ page.tsx              # "Hoy" — tablero de tareas
│  ├─ notes/ noticias/ …    # una página por sección dentro del shell
│  └─ api/                  # ai, auth, github, ko, news, notes, sistemas, summary, tasks
├─ components/
│  ├─ DashboardShell.tsx    # layout global: Topbar + Sidebar + GUITO contextual
│  ├─ KoManager, SistemasManager, TaskBoard …    # gestores por sección
│  └─ KoAiChat, SistemasAiChat, TaskPlannerModal # asistentes (modales, multimodales)
├─ lib/
│  ├─ ai-agent.ts           # runAgent(): núcleo dual-provider + failover + tool-calling
│  ├─ ai-tools.ts           # definiciones + executors de tools
│  └─ ko-ai, sistemas-ai, notes-ai …             # asistentes por dominio (devuelven action JSON)
└─ db/                      # schema Drizzle + cliente Neon
```

---

## Setup local

```bash
npm install
cp .env.example .env.local   # rellena tus valores
```

1. Crea una base **Neon** (Postgres) y corre `supabase/schema.sql` contra ella (el archivo es el DDL; el nombre es histórico). Para sincronizar cambios de schema luego: `npm run db:push`.
2. Configura **Google OAuth** (client id/secret) y genera `AUTH_SECRET` con `npx auth secret`.
3. Crea un **GitHub PAT** (scopes `repo`, `read:user`) y obtén las API keys de **Groq** y **Gemini**.
4. Rellena `.env.local` (ver [`.env.example`](./.env.example) para la lista completa).

```bash
npm run dev   # http://localhost:3000
```

---

## Comandos

```bash
npm run dev          # desarrollo
npm run build        # next build (corre ESLint + type-check)
npm run lint         # next lint
npm run db:push      # sincroniza schema.ts → Neon
npm run db:studio    # drizzle studio
```

> **Antes de pushear:** `next build` corre ESLint y los errores **rompen el deploy**. `tsc --noEmit` no basta — corre **`npx next lint`** antes de hacer push.

---

## Despliegue (Render)

`render.yaml` define el web service (`autoDeploy: true`, branch `main`, `npm ci && npm run build` → `npm start`, healthcheck `/`, Node 20.18.0). **Cada push a `main` despliega automáticamente.**

1. Importa el repo en Render → **New +** → **Blueprint**.
2. Completa las env vars `sync: false` (`DATABASE_URL`, GitHub, Groq) y añade en el dashboard las que no están en el blueprint: `GEMINI_API_KEY`, `GROQ_API_KEY_2` (opcional), `AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `NEXTAUTH_URL`, `OBSIDIAN_VAULT_*`, `IMGBB_API_KEY` (opcional).
3. **Resumen diario:** configura en cron-job.org un `GET $APP_URL/api/summary` con header `Authorization: Bearer $CRON_SECRET` (Render quitó el cron del plan free). De paso despierta la app del free tier.

> **Free tier:** el web service hiberna tras ~15 min; la primera request tras dormir tarda ~50s.

---

## Base de datos

- Conexión vía `DATABASE_URL` (Neon) en `src/db/index.ts`. Schema en `src/db/schema.ts`; DDL espejo en `supabase/schema.sql`.
- El schema **no se aplica solo**: tras editar `schema.ts`, aplica el cambio a Neon (`npm run db:push` o el `ALTER/CREATE` directo). Si falta una tabla/columna, la página falla con `Failed query`.
- **Ojo:** el conector MCP de Supabase apunta a otro proyecto; la DB real de la app es **Neon**.

---

## Endpoints (principales)

| Método | Ruta | Acción |
|---|---|---|
| `GET` `POST` | `/api/tasks` · `/api/tasks/[id]` | tareas |
| `GET` `POST` `PATCH` `DELETE` | `/api/ko` · `/api/ko/subprocesos` | base KO |
| `POST` | `/api/ko/import` | importar Excel de KO altas (hoja `default_1`, cruce por «Error normalizado») |
| `GET` `PATCH` `DELETE` `POST` | `/api/ko/casos` · `/api/ko/casos/[id]` · `/api/ko/casos/promover` · `/api/ko/casos/bulk` · `/api/ko/lotes` · `/api/ko/lotes/[id]` | casos importados (worklist + bandeja, acciones en lote) |
| `GET` `POST` `PATCH` `DELETE` | `/api/sistemas` · `/api/sistemas/secciones` | sistemas y acciones |
| `POST` | `/api/ko/ai` · `/api/sistemas/ai` · `/api/ai` | asistentes IA |
| `GET` | `/api/github/sync?days=N` | sincronizar GitHub |
| `GET` `POST` | `/api/summary` | leer (cron regenera) / regenerar resumen |
| `GET` `POST` | `/api/notes` · `/api/notes/upload-image` | notas Obsidian + subida de imágenes |
| `GET` | `/api/news` | feed de noticias |

---

## Convenciones

- UI y comentarios en **español**.
- Commits van directo a `main`; el push dispara el deploy en Render.
- Markdown se renderiza con `react-markdown` + `remark-gfm` (set compartido de componentes).
- Arquitectura y patrones de IA documentados en [`CLAUDE.md`](./CLAUDE.md).
