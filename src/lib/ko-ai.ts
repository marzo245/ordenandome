/**
 * Asistente de IA de la base de conocimiento KO (errores conocidos del flujo
 * de creación de cuentas de Enel).
 *
 * {@link koAssistant} recibe la conversación + el catálogo de KOs y devuelve un
 * {@link KoAiResult} (JSON con `action`): responder una pregunta, proponer
 * crear un KO, proponer editar uno, o una edición masiva. La IA referencia los
 * KOs por código/error (o id en bulk); el cliente resuelve y confirma el cambio.
 *
 * El grueso de este archivo son helpers de saneamiento: normalizan lo que
 * devuelve el LLM y degradan a `clarify` en vez de romper.
 */
import type { KoEntry } from '@/db';
import { runAgent } from './ai-agent';

/** Forma completa de un KO tal como lo propone la IA (campos = columnas de `ko_entries`). */
export interface KoDraft {
  codigo: string | null;
  error: string;
  eco_notes: string | null;
  sistema: string | null;
  flujo: number | null;
  clasificacion: string | null;
  causa_raiz: string | null;
  sistema_solucion: string | null;
  responsable: string | null;
  subprocesos: string[];
  resolucion: string | null;
  documentacion: string | null;
}

/** Una edición dentro de una propuesta masiva: a qué KO (por id) y qué cambia. */
export interface KoBulkEdit {
  id: string;                 // id EXACTO del KO en el catálogo
  codigo: string | null;     // referencia legible (puede ser null)
  patch: Partial<KoDraft>;   // solo los campos que cambian
}

/** Salida del asistente KO: aclarar, responder, o proponer crear/editar (uno o varios). */
export type KoAiResult =
  | { action: 'clarify'; message: string }
  | { action: 'answer'; message: string }
  | {
      action: 'propose_create';
      message: string;
      draft: KoDraft;
      /** Texto EXACTO del error pendiente que se está resolviendo (para vincular sus cuentas). */
      pendienteError?: string | null;
    }
  | {
      action: 'propose_edit';
      message: string;
      targetCodigo: string | null;
      targetError: string;
      patch: Partial<KoDraft>;
    }
  | { action: 'propose_bulk_edit'; message: string; edits: KoBulkEdit[] };

const VALID_SISTEMA = ['Salesforce', 'Opera', 'SAP', 'eCO'];
const VALID_CLASIFICACION = ['Validación', 'Sistemas', 'Null', 'Relanzamiento'];
const VALID_SISTEMA_SOLUCION = [
  'Salesforce',
  'Opera',
  'SAP',
  'eCO',
  'Heart Beat',
  'Bypass',
];

const SYSTEM = (catalogo: string, pendientes: string) => `Eres un asistente experto en la base de conocimiento "KO" del flujo de creación de cuentas de Enel. Hablas en español, directo y breve.

## ¿Qué es un KO?
Un KO es un error que ATASCA una cuenta en el flujo de creación (flujos 9 a 13). El usuario suele pegar un mensaje de error crudo del sistema (por ejemplo el contenido de ECO_Notes__c) o describir un problema. Tu trabajo es ayudarle a CREAR un KO nuevo o EDITAR uno existente, con los campos normalizados.

## Catálogo actual de KOs
Cada línea: id=<id> · <codigo|sin código> · F<flujo> · <sistema>/<clasificacion> · "<error>" · causa: <causa_raiz> · resuelve: <sistema_solucion> · subprocs: <subprocesos>
${catalogo}

## Cuentas pendientes (errores SIN KO todavía)
Son "Errores normalizados" de cuentas atascadas que aún NO tienen un KO en el catálogo. Cada línea: "<error>" · <n> cuenta(s).
${pendientes}

## Campos de un KO
- codigo: string|null. Ej "SAP-005". null si aún no está formalizado.
- error: texto NORMALIZADO del error (resumen claro y consistente).
- eco_notes: el mensaje CRUDO del sistema, tal cual lo pegó el usuario.
- sistema: uno de [${VALID_SISTEMA.join(' | ')}].
- flujo: número entero 9..13.
- clasificacion: uno de [${VALID_CLASIFICACION.join(' | ')}].
- causa_raiz: causa raíz del error.
- sistema_solucion: dónde se resuelve, uno de [${VALID_SISTEMA_SOLUCION.join(' | ')}].
- responsable: equipo/persona que lo resuelve.
- subprocesos: array de strings. Ej ["SP-001","SP-003"]. [] si no aplica.
- resolucion: pasos para resolverlo (markdown).
- documentacion: notas/links a guías (markdown).

## Reglas de decisión
1. Si el usuario pega un mensaje crudo de error NUEVO (que no coincide con el catálogo) → action "propose_create" con draft completo:
   - Pon el mensaje crudo tal cual en eco_notes.
   - Normaliza ese texto en un resumen claro en error.
   - Infiere sistema, flujo, clasificacion, causa_raiz y sistema_solucion por SIMILITUD con KOs parecidos del catálogo.
   - Deja en null/[] lo que no puedas inferir con confianza (no inventes responsable, resolucion ni documentacion si no los tienes).
2. Si el usuario pide cambiar/mejorar/corregir un KO EXISTENTE → action "propose_edit":
   - targetCodigo: el codigo del KO (o null si ese KO no tiene código).
   - targetError: el error del KO objetivo (para identificarlo si no hay código).
   - patch: SOLO los campos que cambian.
3. Si el usuario PREGUNTA por información del catálogo (ej. "¿cuántos KO de SAP hay?", "¿qué KOs no tienen causa raíz?", "muéstrame los de relanzamiento", "¿cómo se resuelve el de BackEnd connection?") → action "answer":
   - Responde en "message" con MARKDOWN claro (usa listas o tablas si ayudan a leer).
   - Básate SOLO en el catálogo dado arriba. No inventes KOs, campos ni datos que no estén.
   - Si la respuesta requiere un KO que no existe en el catálogo, dilo explícitamente.
4. Si el usuario pide un cambio que aplica a VARIOS KO a la vez (ej. "categoriza como Sistemas todos los de Opera sin clasificación", "pon sistema_solucion eCO a todos los de relanzamiento", "asigna SP-001 a los de integración") → action "propose_bulk_edit":
   - "edits": un array con UN objeto por cada KO afectado.
   - Cada objeto: { "id": "<id EXACTO del catálogo>", "codigo": "<codigo|null>", "patch": { solo los campos que cambian } }.
   - Usa el id EXACTO tal cual aparece en el catálogo (campo id=...). No inventes ids.
   - Incluye SOLO los KOs que cumplen el criterio del usuario y SOLO los campos que pidió cambiar. No añadas KOs ni campos no solicitados.
5. Si falta información para decidir entre crear/editar/responder o para un campo crítico → action "clarify" con UNA sola pregunta concreta.
6. Si el usuario te da la RESOLUCIÓN/causa/documentación de uno de los errores de la lista "Cuentas pendientes" (ej. "para el error X tengo lo siguiente…") → action "propose_create" con el draft completo y, ADEMÁS, copia en el campo "pendienteError" el texto EXACTO de ese error tal como aparece en la lista de pendientes. Así, al confirmar, se creará el KO y se vincularán automáticamente sus cuentas pendientes. Si el error que resuelve no está en esa lista, NO pongas "pendienteError".

## Restricciones de valores
- clasificacion DEBE ser uno de [${VALID_CLASIFICACION.join(' | ')}].
- sistema y sistema_solucion DEBEN salir de sus listas válidas de arriba.
- flujo DEBE estar entre 9 y 13.

## FORMATO DE SALIDA — SIEMPRE JSON VÁLIDO, sin texto fuera del JSON
El objeto JSON SIEMPRE debe tener un campo de primer nivel llamado "action" cuyo valor es EXACTAMENTE uno de: "clarify", "answer", "propose_create", "propose_edit" o "propose_bulk_edit". Nunca omitas "action".
Ejemplos (uno por cada action):

{"action":"clarify","message":"¿Este error aparece en Salesforce o en SAP?"}

{"action":"answer","message":"Hay **3 KOs de SAP** en el catálogo:\n\n- **SAP-005** — Cuenta bloqueada por validación de NIF (flujo 11)\n- **SAP-007** — Centro de coste no sincronizado (flujo 11)\n- **SAP-009** — Contrato sin fecha de inicio (flujo 12)"}

{"action":"propose_create","message":"Es un error nuevo de SAP en el flujo 11. Propongo este KO.","draft":{"codigo":null,"error":"Cuenta sin centro asignado al crear el contrato","eco_notes":"ERROR: account has no cost center assigned [code 5001]","sistema":"SAP","flujo":11,"clasificacion":"Validación","causa_raiz":"El centro de coste no se sincronizó desde Salesforce","sistema_solucion":"SAP","responsable":null,"subprocesos":[],"resolucion":null,"documentacion":null}}

{"action":"propose_create","message":"Documento el KO del error pendiente «Error creando el Medidor» con la resolución que me das y vinculo sus cuentas.","pendienteError":"Error creando el Medidor","draft":{"codigo":null,"error":"Error creando el Medidor","eco_notes":null,"sistema":"Opera","flujo":12,"clasificacion":"Sistemas","causa_raiz":"El medidor no se sincroniza desde Opera","sistema_solucion":"Opera","responsable":null,"subprocesos":["SP-003"],"resolucion":"1. Relanzar la novedad...","documentacion":null}}

{"action":"propose_edit","message":"Actualizo la causa raíz y el sistema de solución del KO SAP-005.","targetCodigo":"SAP-005","targetError":"Cuenta bloqueada por validación de NIF","patch":{"causa_raiz":"El NIF no pasa la validación de Hacienda","sistema_solucion":"Bypass"}}

{"action":"propose_bulk_edit","message":"Categorizo como Sistemas los 2 KOs de Opera que no tenían clasificación.","edits":[{"id":"a1b2c3","codigo":"OPE-002","patch":{"clasificacion":"Sistemas"}},{"id":"d4e5f6","codigo":null,"patch":{"clasificacion":"Sistemas"}}]}

Si el usuario dice "sí"/"confirma" a un borrador previo, repite el último propose tal cual.`;

/** Resume el catálogo de KOs en líneas compactas (con id) para el system prompt. */
function summarizeCatalog(entries: KoEntry[]): string {
  if (entries.length === 0) return '(catálogo vacío — aún no hay KOs)';
  return entries
    .map((e) => {
      const codigo = e.codigo ?? 'sin código';
      const flujo = e.flujo ?? '?';
      const sistema = e.sistema ?? '—';
      const clasif = e.clasificacion ?? '—';
      const error = e.error ?? '?';
      const causa = e.causa_raiz ?? '—';
      const sol = e.sistema_solucion ?? '—';
      const subs =
        Array.isArray(e.subprocesos) && e.subprocesos.length > 0
          ? e.subprocesos.join(',')
          : '—';
      return `- id=${e.id} · ${codigo} · F${flujo} · ${sistema}/${clasif} · "${error}" · causa: ${causa} · resuelve: ${sol} · subprocs: ${subs}`;
    })
    .join('\n');
}

/** Grupo de cuentas pendientes (error sin KO) que se pasa como contexto al asistente. */
export interface KoPendienteGroup {
  error: string;
  count: number;
}

/** Resume los errores pendientes (sin KO) en líneas compactas para el system prompt. */
function summarizePendientes(pendientes: KoPendienteGroup[]): string {
  if (pendientes.length === 0) return '(no hay cuentas pendientes)';
  return pendientes
    .map((p) => `- "${p.error}" · ${p.count} cuenta${p.count === 1 ? '' : 's'}`)
    .join('\n');
}

/** Completa un draft parcial del LLM a un {@link KoDraft} con todos los campos y tipos correctos. */
function normalizeDraft(raw: Partial<KoDraft> | undefined): KoDraft {
  const d = raw ?? {};
  return {
    codigo: d.codigo ?? null,
    error: typeof d.error === 'string' ? d.error : '',
    eco_notes: d.eco_notes ?? null,
    sistema: d.sistema ?? null,
    flujo: typeof d.flujo === 'number' ? d.flujo : null,
    clasificacion: d.clasificacion ?? null,
    causa_raiz: d.causa_raiz ?? null,
    sistema_solucion: d.sistema_solucion ?? null,
    responsable: d.responsable ?? null,
    subprocesos: Array.isArray(d.subprocesos) ? d.subprocesos : [],
    resolucion: d.resolucion ?? null,
    documentacion: d.documentacion ?? null,
  };
}

const DRAFT_KEYS: (keyof KoDraft)[] = [
  'codigo',
  'error',
  'eco_notes',
  'sistema',
  'flujo',
  'clasificacion',
  'causa_raiz',
  'sistema_solucion',
  'responsable',
  'subprocesos',
  'resolucion',
  'documentacion',
];

// Patch parcial: deja SOLO claves válidas de KoDraft (no fuerza todos los campos).
function normalizePatch(raw: unknown): Partial<KoDraft> {
  if (!raw || typeof raw !== 'object') return {};
  const src = raw as Record<string, unknown>;
  const out: Partial<KoDraft> = {};
  for (const key of DRAFT_KEYS) {
    if (!(key in src)) continue;
    const v = src[key];
    if (key === 'subprocesos') {
      if (Array.isArray(v)) out.subprocesos = v.filter((x): x is string => typeof x === 'string');
    } else if (key === 'flujo') {
      if (typeof v === 'number') out.flujo = v;
      else if (v === null) out.flujo = null;
    } else {
      // resto de campos: string | null
      if (typeof v === 'string' || v === null) {
        (out as Record<string, unknown>)[key] = v;
      }
    }
  }
  return out;
}

/** Heurística: ¿el último mensaje del usuario parece una pregunta? (para preferir `answer`). */
function looksLikeQuestion(messages: { role: string; content: string }[]): boolean {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  if (!last) return false;
  const t = last.content.toLowerCase();
  if (t.includes('?') || t.includes('¿')) return true;
  return /\b(cu[aá]nt|qu[eé]|cu[aá]l|c[oó]mo|d[oó]nde|qui[eé]n|mu[eé]stra|lista|enumera|hay)\b/.test(t);
}

/**
 * Punto de entrada del asistente KO.
 * @param messages Conversación con el usuario.
 * @param entries Catálogo actual de KOs (contexto para el LLM).
 * @returns Un {@link KoAiResult} ya parseado y saneado (degrada a `clarify` si algo falla).
 */
export async function koAssistant(
  messages: { role: 'user' | 'assistant'; content: string; images?: string[] }[],
  entries: KoEntry[],
  pendientes: KoPendienteGroup[] = []
): Promise<KoAiResult> {
  // Si hay capturas adjuntas, usamos Gemini (multimodal); Groq llama-3.3 es solo texto.
  const hasImages = messages.some((m) => m.images && m.images.length > 0);
  const result = await runAgent({
    system: SYSTEM(summarizeCatalog(entries), summarizePendientes(pendientes)),
    messages,
    temperature: 0.3,
    responseFormat: 'json_object',
    tools: false,
    provider: hasImages ? 'gemini' : 'groq',
  });

  // Tolera fences de código (```json ... ```) y texto alrededor.
  function extractJson(raw: string): string {
    let s = (raw ?? '').trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    const first = s.indexOf('{');
    const last = s.lastIndexOf('}');
    if (first >= 0 && last > first) s = s.slice(first, last + 1);
    return s;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extractJson(result.content));
  } catch {
    // No vino JSON usable: degrada a una aclaración con el texto del modelo.
    return {
      action: 'clarify',
      message:
        result.content?.trim() ||
        'No pude generar una propuesta. ¿Puedes reformular o pegar el mensaje de error?',
    };
  }

  // Infiere la acción si falta o es inválida (en vez de reventar con 500).
  const VALID_ACTIONS = [
    'clarify',
    'answer',
    'propose_create',
    'propose_edit',
    'propose_bulk_edit',
  ];
  let action = parsed.action as string | undefined;
  if (!action || !VALID_ACTIONS.includes(action)) {
    if (Array.isArray(parsed.edits)) action = 'propose_bulk_edit';
    else if (parsed.draft || parsed.eco_notes) action = 'propose_create';
    else if (parsed.patch || parsed.targetCodigo || parsed.targetError) action = 'propose_edit';
    else if (typeof parsed.message === 'string' && parsed.message.trim() && looksLikeQuestion(messages))
      action = 'answer';
    else if (typeof parsed.message === 'string' && parsed.message.trim()) action = 'answer';
    else action = 'clarify';
  }

  const message =
    typeof parsed.message === 'string' && parsed.message.trim()
      ? parsed.message
      : action === 'clarify'
        ? '¿Puedes dar más detalle?'
        : action === 'answer'
          ? 'No tengo información en el catálogo para responder eso.'
          : 'Propuesta lista para revisar.';

  if (action === 'answer') {
    return { action, message };
  }

  if (action === 'propose_create') {
    // Soporta tanto {draft:{...}} como los campos del draft al nivel raíz.
    const draftSource = (parsed.draft as Partial<KoDraft>) ?? (parsed as Partial<KoDraft>);
    const pendienteError =
      typeof parsed.pendienteError === 'string' && parsed.pendienteError.trim()
        ? parsed.pendienteError
        : null;
    return { action, message, draft: normalizeDraft(draftSource), pendienteError };
  }

  if (action === 'propose_edit') {
    return {
      action,
      message,
      targetCodigo: (parsed.targetCodigo as string | null) ?? null,
      targetError: typeof parsed.targetError === 'string' ? parsed.targetError : '',
      patch: normalizePatch(parsed.patch),
    };
  }

  if (action === 'propose_bulk_edit') {
    const rawEdits = Array.isArray(parsed.edits) ? parsed.edits : [];
    const edits: KoBulkEdit[] = rawEdits
      .filter(
        (e): e is Record<string, unknown> =>
          !!e && typeof e === 'object' && typeof (e as Record<string, unknown>).id === 'string'
      )
      .map((e) => ({
        id: e.id as string,
        codigo: (e.codigo as string | null) ?? null,
        patch: normalizePatch(e.patch),
      }));
    if (edits.length === 0) {
      // No hay ediciones aplicables: degrada en vez de reventar.
      return {
        action: 'clarify',
        message:
          typeof parsed.message === 'string' && parsed.message.trim()
            ? parsed.message
            : 'No identifiqué KOs que cumplan ese criterio. ¿Puedes concretar cuáles quieres cambiar?',
      };
    }
    return { action, message, edits };
  }

  return { action: 'clarify', message };
}
