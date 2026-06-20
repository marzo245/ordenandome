# CLAUDE.md

Guía para trabajar en este repositorio. Léela antes de hacer cambios.

## Qué es

**Calendario Inteligente** — app personal estilo Notion para gestionar tareas, notas (Obsidian), noticias, actividad de GitHub y dos bases de conocimiento operativas: **KO** (errores conocidos del flujo de creación de cuentas de Enel) y **Sistemas** (OPERA, eCO, Salesforce, ForceBeat, Beats, SAP). Incluye asistentes de IA con **GUITO**, una mascota Lottie.

## Stack

- **Next.js 15.1.0** (App Router) + **React 19** + **TypeScript**.
- **Tailwind** con variables CSS de tema (`var(--bg)`, `var(--text)`, `var(--accent)`, `var(--border)`, `var(--surface)`, `var(--surface-hover)`, `var(--muted)`, `var(--danger)`). Usa estas variables, no colores fijos.
- **Drizzle ORM** sobre **Neon Postgres** (driver `postgres-js`).
- **NextAuth v5** + Google OAuth.
- IA dual: **Groq** (rápido, default) y **Gemini** (razonamiento profundo + multimodal).
- Desplegado en **Render** (auto-deploy al hacer push a `main`).

## Comandos

```bash
npm run dev          # desarrollo
npm run build        # next build (¡corre ESLint + type-check!)
npm run lint         # = next lint
npm run db:push      # drizzle-kit push (sincroniza schema → DB)
npm run db:generate  # genera migraciones
npm run db:studio    # drizzle studio
```

## ⚠️ Antes de hacer push (deploy en Render)

El build de Render ejecuta `npm ci && npm run build`, y **`next build` corre ESLint y trata los errores como fatales**. `npx tsc --noEmit` **NO** es suficiente — pasa el type-check pero deja errores de lint que rompen el deploy.

**Siempre corre `npx next lint` antes de pushear.** Errores comunes que fallan el build (no solo warnings):
- `@next/next/no-html-link-for-pages`: usa `<Link>` de `next/link`, no `<a href>` para rutas internas.
- `@next/next/no-img-element`: usa `<img>` solo con `{/* eslint-disable-next-line @next/next/no-img-element */}`.

## Base de datos

- Conexión: `src/db/index.ts` lee `DATABASE_URL` (Neon). El cliente y el schema se exportan desde `@/db`.
- Schema en `src/db/schema.ts` (Drizzle). El DDL equivalente se mantiene a mano en `supabase/schema.sql`.
- **El schema NO se aplica solo.** Tras cambiar `schema.ts`, hay que aplicar el DDL a Neon (vía `npm run db:push`, o ejecutando el `ALTER/CREATE` directamente contra `DATABASE_URL`). Si una tabla/columna falta en Neon, la página revienta con `Failed query: ...`.
- **Ojo:** el MCP de Supabase apunta a OTRO proyecto (no tiene las tablas de esta app). La DB real es Neon.

Tablas clave: `tasks`, `notes`/`note_links`, `sistemas`, `sistema_secciones` (acciones de cada sistema; columna `pasos` jsonb = flujo multi-sistema), `ko_entries`/`ko_subprocesos` (catálogo + subprocesos), `ko_import_lotes`/`ko_import_casos` (importación de Excel de KO altas: un lote por subida, un caso por fila; `fila` jsonb = la fila cruda, `tipo` conocida|desconocida, `estado` pendiente|resuelto), `github_activity`, `daily_summaries`.

**Importación de KO altas** (`POST /api/ko/import`, usa `xlsx`/SheetJS server-side): el Excel trae cada cuenta atascada como una fila. Lee la hoja **`default_1`** (si no existe, la de más filas; la otra hoja `Hoja1` es una tabla dinámica) y cruza por contención contra `ko_entries.error` — **sin IA**. **Doble pasada (en este orden):** 1) **`Error normalizado`** (criterio principal: es lo que el usuario normaliza y mantiene); 2) si no cruza o es ambiguo, **desempata por `ECO_Notes`** (el mensaje crudo incluye el **código del error**, p. ej. `EN 244`, que distingue KOs con el mismo enunciado pero distinta clasificación — varios "Error creando el Medidor": ECO-009/Relanzamiento `EN 244`, SAP-004/Sistemas `EM 111`…). Solo coincidencia única cuenta como conocida; 0 o ambiguo tras ambas pasadas = desconocida. El `Error normalizado` se guarda en `error_texto` como **etiqueta para agrupar** las pendientes. En el Excel real: ~741 cruzan por Error normalizado + ~275 por desempate ECO_Notes = 1016 conocidas / 126 pendientes. El «Error normalizado» se guarda en `error_texto` solo como **etiqueta para agrupar** las pendientes. Autodetecta la columna de cruce (ECO_Notes; si no, `{ needsColumn, columnas }`). «Conocidas» agrupa por KO (worklist con plan de acción + resolver en lote), «Pendientes» agrupa por error para promover **todo el grupo de golpe**. Endpoints: `POST /api/ko/casos/promover` (`{ mode: 'link'|'create', caso_ids, ... }`, `create` reusa `EntryEditor`), `POST /api/ko/casos/bulk` (`resolver`|`reabrir`|`descartar`), `/api/ko/casos[/[id]]`, `/api/ko/lotes` (GET) y `/api/ko/lotes/[id]` (DELETE cascade). Ambas pestañas tienen buscador (Conocidas además filtra por clasificación) y la zona de subida lista las importaciones con botón Borrar.

## Estructura

```
src/app/
  page.tsx            # "Hoy" — tablero de tareas
  notes/  noticias/  github/  ko/  sistemas/   # secciones (cada una su página en el shell)
  login/
  api/                # ai, auth, books, github, ko, news, notes, sistemas, summary, tasks
src/components/
  DashboardShell.tsx  # layout global: Topbar + Sidebar + botones flotantes + GUITO contextual
  Sidebar.tsx         # navegación de primer nivel (usa next/link)
  KoManager / SistemasManager / TaskBoard ...   # gestores por sección
                      # KoManager: tabs Catálogo · Subprocesos · Conocidas (worklist) · Pendientes (bandeja import)
  KoAiChat / SistemasAiChat / TaskPlannerModal  # asistentes (modales)
  GuitoWalker / LottiePlayer / AiLottieButton   # mascota GUITO (public/guito.json)
src/lib/
  ai-agent.ts         # runAgent(): núcleo OpenAI-compatible, dual provider, tool-calling, multimodal
  ai-tools.ts         # definiciones + executors de tools
  ko-ai.ts / sistemas-ai.ts / notes-ai.ts       # asistentes por dominio (devuelven JSON con "action")
  obsidian.ts / vault-context.ts / github.ts / news.ts / google-calendar.ts
```

## IA — patrones

- **`runAgent`** (`src/lib/ai-agent.ts`) es el único punto de llamada al LLM. OpenAI-compatible para Groq y Gemini.
  - `provider: 'groq'` (default, texto) o `'gemini'` (multimodal / razonamiento). Groq `llama-3.3-70b` es **solo texto**: si hay imágenes, enruta a Gemini.
  - **Failover por cuota (429) + reintento transitorio (503/502/529):** `runAgent` arma una cadena de intentos con `buildAttempts()`. Si un proveedor devuelve `429` (rate limit / TPD agotado) pasa al siguiente intento; si devuelve un error transitorio (`503/502/529`: modelo saturado) reintenta el **mismo** proveedor con backoff (hasta 2 veces: 0.6s, 1.2s) y, si sigue fallando, pasa al siguiente. Para `provider: 'groq'` la cadena es **`GROQ_API_KEY` → `GROQ_API_KEY_2` → Gemini**; para `provider: 'gemini'` es solo Gemini (no cae de vuelta a Groq). `runAgentOnce(opts, apiKey)` ejecuta un intento concreto; cualquier otro error se propaga de inmediato. Errores tipados: `RateLimitError` (429) y `TransientError` (503/502/529). ⚠️ Dos keys de Groq de la **misma organización** comparten la cuota TPD — para sumar tokens reales deben ser de cuentas/orgs distintas.
  - Soporta contenido multimodal: cada mensaje puede llevar `images?: string[]` (URLs o data URLs base64) → se mandan como partes `image_url`.
  - **Capturas en los chats (KO/Sistemas):** al pegar/adjuntar una imagen, el cliente la sube (`/api/notes/upload-image`) e inserta el **link markdown `![captura](url)` en el cuadro de texto** — NO la manda a la IA por defecto (queda incrustada como en markdown y, al confirmar, se conserva en la documentación vía `withConversationImages`). Solo el botón **«Analizar»** adjunta esas URLs como `images` → enruta a Gemini para que las lea. Es decir: la imagen se **analiza solo si se pide**.
  - `responseFormat: 'json_object'` para asistentes que devuelven una `action`.
- Los asistentes de dominio (`ko-ai`, `sistemas-ai`) devuelven un JSON con un campo `action` (`clarify` | `answer` | `propose_create` | `propose_edit` | `propose_create_accion` …). El cliente (chat) renderiza una propuesta y, al confirmar, hace el POST/PATCH real. La IA referencia entidades por **nombre**; el cliente las resuelve a `id`.
- **GUITO es contextual** (en `DashboardShell` según la ruta): `/ko` → asistente KO, `/sistemas` → asistente Sistemas, resto → planner de tareas. La mascota debe aparecer donde haya IA.

## Variables de entorno (`.env.local`)

`DATABASE_URL`, `GROQ_API_KEY`/`GROQ_API_KEY_2` (opcional, failover de cuota)/`GROQ_MODEL`, `GEMINI_API_KEY`/`GEMINI_MODEL`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `NEXTAUTH_URL`, `GITHUB_TOKEN`/`GITHUB_USERNAME`, `OBSIDIAN_VAULT_REPO`/`OBSIDIAN_VAULT_BRANCH`, `CRON_SECRET`, `IMGBB_API_KEY` (opcional; sin ella la subida de imágenes cae a catbox.moe). Ver `.env.example`.

## Convenciones

- UI y comentarios en **español**.
- Commits van directo a `main` (es el flujo del repo: `github.com/marzo245/ordenandome`). Push a `main` dispara deploy en Render.
- Subida de imágenes: `POST /api/notes/upload-image` (imgbb con fallback a catbox), devuelve `{ url }`.
- Markdown se renderiza con `react-markdown` + `remark-gfm` con un set compartido de componentes (ver `MD_COMPONENTS` en los managers/chats).

## Buenas prácticas (aplícalas SIEMPRE, sin que lo pidan)

En cada cambio, además de cumplir lo que se pide, deja el código y la UI mejor de como estaban. No hace falta avisar para esto:

**Código**
- **Reusar antes que duplicar:** si un patrón ya existe (p. ej. `MarkdownImageTextarea`, `MD_COMPONENTS`, `runAgent`), úsalo o extráelo a un componente/util compartido en vez de copiar.
- **Tipado estricto:** nada de `any` injustificado; tipa props y retornos.
- **Maneja los estados:** carga, error, vacío y deshabilitado. Nunca dejes una promesa sin `catch` ni una UI sin feedback.
- **No dejes UI muerta:** todo control visible debe hacer algo (sin botones/inputs decorativos sin handler).
- **Antes de pushear:** `npx next lint` **siempre** (los errores rompen el deploy en Render); si tocaste tipos, `npx tsc --noEmit`.

**Diseño / UI**
- **Usa los tokens del tema** (`var(--bg)`, `--text`, `--accent`, `--border`, `--muted`, `--surface`, `--danger`), nunca colores fijos.
- **Jerarquía y consistencia:** mismos espaciados, tamaños y componentes que el resto de la sección; el estado activo y la acción primaria deben distinguirse (usa `--accent`).
- **Accesibilidad:** foco visible (`focus:` ring/border), `aria-label`/`<label>` en controles, contraste suficiente (ojo con `--muted` en texto pequeño), targets táctiles cómodos.
- **Responsive** y respeta el layout del shell (`max-w`, paddings existentes).
- **Microcopy en español**, claro y breve.

Si una mejora es grande o cambia comportamiento, menciónala/propónla; las pequeñas (lint, tipos, estados, accesibilidad, tokens) aplícalas directo.
