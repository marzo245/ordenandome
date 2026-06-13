import type { KoEntry } from '@/db';
import { runAgent } from './ai-agent';

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

export type KoAiResult =
  | { action: 'clarify'; message: string }
  | { action: 'propose_create'; message: string; draft: KoDraft }
  | {
      action: 'propose_edit';
      message: string;
      targetCodigo: string | null;
      targetError: string;
      patch: Partial<KoDraft>;
    };

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

const SYSTEM = (catalogo: string) => `Eres un asistente experto en la base de conocimiento "KO" del flujo de creación de cuentas de Enel. Hablas en español, directo y breve.

## ¿Qué es un KO?
Un KO es un error que ATASCA una cuenta en el flujo de creación (flujos 9 a 13). El usuario suele pegar un mensaje de error crudo del sistema (por ejemplo el contenido de ECO_Notes__c) o describir un problema. Tu trabajo es ayudarle a CREAR un KO nuevo o EDITAR uno existente, con los campos normalizados.

## Catálogo actual de KOs (resumen: codigo · sistema · error · causa_raiz)
${catalogo}

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
3. Si falta información para decidir entre crear/editar o para un campo crítico → action "clarify" con UNA sola pregunta concreta.

## Restricciones de valores
- clasificacion DEBE ser uno de [${VALID_CLASIFICACION.join(' | ')}].
- sistema y sistema_solucion DEBEN salir de sus listas válidas de arriba.
- flujo DEBE estar entre 9 y 13.

## FORMATO DE SALIDA — SIEMPRE JSON VÁLIDO, sin texto fuera del JSON
El objeto JSON SIEMPRE debe tener un campo de primer nivel llamado "action" cuyo valor es EXACTAMENTE uno de: "clarify", "propose_create" o "propose_edit". Nunca omitas "action".
Ejemplos (uno por cada action):

{"action":"clarify","message":"¿Este error aparece en Salesforce o en SAP?"}

{"action":"propose_create","message":"Es un error nuevo de SAP en el flujo 11. Propongo este KO.","draft":{"codigo":null,"error":"Cuenta sin centro asignado al crear el contrato","eco_notes":"ERROR: account has no cost center assigned [code 5001]","sistema":"SAP","flujo":11,"clasificacion":"Validación","causa_raiz":"El centro de coste no se sincronizó desde Salesforce","sistema_solucion":"SAP","responsable":null,"subprocesos":[],"resolucion":null,"documentacion":null}}

{"action":"propose_edit","message":"Actualizo la causa raíz y el sistema de solución del KO SAP-005.","targetCodigo":"SAP-005","targetError":"Cuenta bloqueada por validación de NIF","patch":{"causa_raiz":"El NIF no pasa la validación de Hacienda","sistema_solucion":"Bypass"}}

Si el usuario dice "sí"/"confirma" a un borrador previo, repite el último propose tal cual.`;

function summarizeCatalog(entries: KoEntry[]): string {
  if (entries.length === 0) return '(catálogo vacío — aún no hay KOs)';
  return entries
    .map((e) => {
      const codigo = e.codigo ?? '(sin código)';
      const sistema = e.sistema ?? '?';
      const error = e.error ?? '?';
      const causa = e.causa_raiz ?? '?';
      return `- ${codigo} · ${sistema} · ${error} · ${causa}`;
    })
    .join('\n');
}

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

export async function koAssistant(
  messages: { role: 'user' | 'assistant'; content: string }[],
  entries: KoEntry[]
): Promise<KoAiResult> {
  const result = await runAgent({
    system: SYSTEM(summarizeCatalog(entries)),
    messages,
    temperature: 0.3,
    responseFormat: 'json_object',
    tools: false,
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
  let action = parsed.action as string | undefined;
  if (action !== 'clarify' && action !== 'propose_create' && action !== 'propose_edit') {
    if (parsed.draft || parsed.error) action = 'propose_create';
    else if (parsed.patch || parsed.targetCodigo || parsed.targetError) action = 'propose_edit';
    else action = 'clarify';
  }

  const message =
    typeof parsed.message === 'string' && parsed.message.trim()
      ? parsed.message
      : action === 'clarify'
        ? '¿Puedes dar más detalle?'
        : 'Propuesta lista para revisar.';

  if (action === 'propose_create') {
    // Soporta tanto {draft:{...}} como los campos del draft al nivel raíz.
    const draftSource = (parsed.draft as Partial<KoDraft>) ?? (parsed as Partial<KoDraft>);
    return { action, message, draft: normalizeDraft(draftSource) };
  }

  if (action === 'propose_edit') {
    return {
      action,
      message,
      targetCodigo: (parsed.targetCodigo as string | null) ?? null,
      targetError: typeof parsed.targetError === 'string' ? parsed.targetError : '',
      patch: (parsed.patch as Partial<KoDraft>) ?? {},
    };
  }

  return { action: 'clarify', message };
}
