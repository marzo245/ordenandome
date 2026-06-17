/**
 * Generador del resumen diario por IA.
 *
 * A partir de las tareas del día, la actividad de GitHub y las noticias del
 * nicho, produce un resumen breve en Markdown ("Qué hice hoy", "Pendiente",
 * "Prioridad para mañana", "Para leer hoy"). Inyecta el mapa del vault como
 * grounding y permite tools solo si ese mapa existe.
 */
import type { Task, GithubActivityRow as GitHubActivity } from '@/db';
import type { NewsItem } from './news';
import { runAgent } from './ai-agent';
import { buildVaultMap } from './vault-context';

/** Datos del día que alimentan el resumen. */
interface SummaryInput {
  day: string;
  tasksDue: Task[];
  tasksDone: Task[];
  activity: GitHubActivity[];
  news: NewsItem[];
}

const SYSTEM = `Eres un asistente de productividad para un ingeniero de software.
Generas un resumen diario breve, directo y accionable en español, en formato MARKDOWN bien estructurado.

Estructura obligatoria con encabezados ### y listas con guión:

### Qué hice hoy
- Punto 1 (basado en tareas completadas + actividad GitHub)
- Punto 2

### Pendiente o por vencer
- Punto 1
- O escribe "Sin pendientes." si no hay nada.

### Prioridad para mañana
- Punto 1 accionable

### Para leer hoy
- 2 a 3 noticias del nicho que valga la pena leer, **eligiéndolas según el trabajo del usuario** (tareas del día, repos en los que está commiteando, prioridades).
- Formato de cada bullet: \`[fuente] [Título corto del artículo](url) — por qué le sirve hoy, 1 línea\`.
- Si no hay noticias relevantes, escribe "Sin lecturas sugeridas hoy.".
- NO inventes URLs. Usa SOLO las que vengan en el contexto.
- NO copies todas las noticias, filtra: máximo 3 y solo si conectan con lo que está haciendo.

REGLAS DE FORMATO
- Usa SIEMPRE \`-\` para viñetas (nunca \`*\` ni \`+\`).
- NO anides listas con \`+\` ni con sangría rara.
- Usa **negrita** solo para destacar términos clave (1-2 por sección).
- Máximo ~200 palabras totales. Sin relleno, sin saludos, sin firmas.`;

/**
 * Genera el resumen diario en Markdown a partir de {@link SummaryInput}.
 * @returns El texto del resumen (Markdown), listo para guardar/mostrar.
 */
export async function generateSummary(input: SummaryInput): Promise<string> {
  const userPrompt = JSON.stringify({
    fecha: input.day,
    tareas_completadas: input.tasksDone.map((t) => t.title),
    tareas_pendientes_o_vencen: input.tasksDue.map((t) => ({
      titulo: t.title,
      prioridad: t.priority,
      vence: t.due_date,
    })),
    actividad_github: input.activity.map((a) => `[${a.kind}] ${a.repo}: ${a.title}`),
    noticias_del_nicho: input.news.slice(0, 25).map((n) => ({
      fuente: n.source_label,
      nicho: n.niche_label,
      titulo: n.title,
      url: n.url ?? n.comments_url,
      puntos: n.points,
    })),
  });

  const vaultMap = await buildVaultMap().catch(() => '');
  const systemWithVault = vaultMap
    ? `${SYSTEM}\n\n## Vault del usuario (úsalo SOLO si necesitas conectar tareas/noticias con proyectos)\n\n${vaultMap}\n\nPuedes usar search_vault si una noticia podría relacionarse con un proyecto específico y quieres validar.`
    : SYSTEM;

  const result = await runAgent({
    system: systemWithVault,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.4,
    tools: !!vaultMap,
    maxToolHops: 2,
  });
  return result.content;
}
