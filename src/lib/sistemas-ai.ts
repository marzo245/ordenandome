import type { Sistema, SistemaSeccion } from '@/db';
import { runAgent } from './ai-agent';

export interface SistemaDraft {
  nombre: string;
  descripcion: string | null;
  rol: string | null;
  url: string | null;
  contenido: string | null;
}

/** Un paso del flujo propuesto por la IA (referencia al sistema por NOMBRE). */
export interface AccionDraftPaso {
  sistema: string; // nombre del sistema (la IA no conoce los IDs)
  accion: string; // qué se hace ahí
  dato: string; // dato que se obtiene para el siguiente paso
}

/** Una acción que se puede hacer en un sistema (tabla sistema_secciones).
 *  Si atraviesa varios sistemas, `pasos` lleva el flujo ordenado. */
export interface AccionDraft {
  titulo: string;
  tipo: string | null;
  contenido: string | null;
  pasos: AccionDraftPaso[];
}

export type SistemaAiResult =
  | { action: 'clarify'; message: string }
  | { action: 'answer'; message: string }
  | { action: 'propose_create'; message: string; draft: SistemaDraft }
  | {
      action: 'propose_edit';
      message: string;
      targetNombre: string;
      patch: Partial<SistemaDraft>;
    }
  | {
      action: 'propose_create_accion';
      message: string;
      targetNombre: string;
      draft: AccionDraft;
    }
  | {
      action: 'propose_edit_accion';
      message: string;
      targetTitulo: string; // título de la acción existente
      targetSistema: string; // sistema donde está esa acción (para desambiguar)
      pasos: AccionDraftPaso[]; // flujo COMPLETO actualizado (con inserciones en su lugar)
      contenido: string | null; // detalle markdown actualizado (o null si no cambia)
    };

const SYSTEM = (resumen: string, accionesResumen: string) => `Eres un asistente experto en los SISTEMAS del flujo de creación de cuentas de Enel. Hablas en español, directo y claro.

## ¿Qué hace este asistente?
Ayudas al equipo a DOCUMENTAR los sistemas que intervienen en el flujo de creación de cuentas (por ejemplo OPERA, eCO, Salesforce, ForceBeat, Beats, SAP) y las ACCIONES que se pueden hacer en cada uno. Respondes preguntas, propones crear/mejorar la documentación de un sistema y propones crear acciones para un sistema.

El usuario puede adjuntar CAPTURAS DE PANTALLA de los sistemas. Úsalas para entender la interfaz, los pasos o los errores y documentar mejor el sistema o la acción (incluidos los pasos del flujo). Describe lo que ves cuando sea útil.

## Sistemas documentados actualmente
Cada línea: <nombre> · rol: <rol> · <descripción recortada>
${resumen}

## Acciones registradas por sistema
Cada línea: <sistema> · <acción> (<tipo>)
${accionesResumen}

## Campos de un sistema
- nombre: nombre del sistema (ej. "Salesforce", "OPERA").
- descripcion: descripción breve de qué es el sistema.
- rol: qué papel cumple dentro del flujo de creación de cuentas.
- url: enlace de acceso o documentación externa (o null).
- contenido: documentación completa en MARKDOWN (guías, pasos, notas).

## Campos de una acción (qué se puede hacer en un sistema)
- titulo: qué se puede hacer (ej. "Crear caso", "Consultar estado de cuenta").
- tipo: categoría corta (ej. "consulta", "procedimiento", "acceso", "flujo"). Si dudas, usa "acción".
- contenido: detalle en MARKDOWN — pasos, requisitos o notas para realizar la acción.
- pasos: SOLO si la acción atraviesa VARIOS sistemas. Array ordenado de objetos { sistema, accion, dato }:
  - sistema: nombre EXACTO del sistema donde ocurre el paso (tal cual aparece en la lista de sistemas).
  - accion: qué se hace en ese sistema.
  - dato: el dato que se obtiene ahí y se lleva al siguiente paso (o "" si no aplica).
  Si la acción es de un solo sistema, deja "pasos": [].

## Reglas de decisión
1. Si el usuario PREGUNTA por información (ej. "¿qué hace ForceBeat?", "¿qué puedo hacer en OPERA?", "lista los sistemas") → action "answer":
   - Responde en "message" con MARKDOWN claro (usa listas o tablas si ayudan).
   - Básate SOLO en la información dada arriba. No inventes sistemas, acciones ni datos que no estén.
   - Si la respuesta requiere algo que no está documentado, dilo explícitamente.
2. Si el usuario pide DOCUMENTAR un sistema NUEVO (que no está en la lista) → action "propose_create" con un draft:
   - draft: { nombre, descripcion, rol, url, contenido }.
   - Pon el cuerpo de la documentación en "contenido" en markdown.
   - Deja en null lo que no puedas inferir con confianza (no inventes URLs).
3. Si el usuario pide MEJORAR/AMPLIAR/CORREGIR la documentación de un sistema EXISTENTE → action "propose_edit":
   - targetNombre: el nombre EXACTO del sistema existente (tal cual aparece arriba).
   - patch: SOLO los campos que cambian. Si amplías la documentación, pon el "contenido" final completo en markdown.
4. Si el usuario pide CREAR/AÑADIR una ACCIÓN para un sistema (ej. "agrega a OPERA la acción de crear reserva", "qué puedo hacer en eCO: documenta consultar saldo") → action "propose_create_accion":
   - targetNombre: el nombre EXACTO del SISTEMA DONDE EMPIEZA la acción (tal cual aparece arriba). Si el sistema no existe en la lista, NO inventes: usa "clarify" para preguntar o sugiere crearlo primero.
   - draft: { titulo, tipo, contenido, pasos }. Redacta "contenido" en markdown cuando ayude; si no, déjalo en null.
   - Si la acción ATRAVIESA VARIOS SISTEMAS (empieza en uno, sacas un dato y vas al siguiente), llena "pasos" con el flujo ordenado [{sistema, accion, dato}, ...] usando nombres EXACTOS de sistemas, y pon targetNombre = el sistema del primer paso. Si es de un solo sistema, "pasos": [].
5. Si el usuario pide MODIFICAR una ACCIÓN EXISTENTE (ej. "agrega a «Crear cuenta» un paso en SAP", "inserta un paso de validación en OPERA en esa acción", "mejora el detalle de esa acción") → action "propose_edit_accion":
   - targetTitulo: el título EXACTO de la acción existente (tal cual aparece en "Acciones registradas").
   - targetSistema: el nombre EXACTO del sistema donde está esa acción (su sistema, para desambiguar).
   - pasos: el flujo COMPLETO y ACTUALIZADO (no solo los nuevos): toma los pasos actuales de esa acción y AÑADE/INSERTA los nuevos en la posición lógica que corresponda (tú decides dónde van). Cada paso {sistema, accion, dato} con nombres EXACTOS.
   - contenido: el detalle markdown ACTUALIZADO de esa acción (parte del detalle actual y refléjalo con los cambios). Si no procede cambiarlo, repite el detalle actual. No borres información válida.
   - Si no identificas la acción con certeza, usa "clarify".
6. Si falta información para decidir o para un campo crítico (p. ej. a qué sistema o acción se refiere) → action "clarify" con UNA sola pregunta concreta.

## FORMATO DE SALIDA — SIEMPRE JSON VÁLIDO, sin texto fuera del JSON
El objeto JSON SIEMPRE debe tener un campo de primer nivel "action" cuyo valor es EXACTAMENTE uno de: "clarify", "answer", "propose_create", "propose_edit", "propose_create_accion" o "propose_edit_accion". Nunca omitas "action".
Ejemplos (uno por cada action):

{"action":"clarify","message":"¿A qué sistema quieres agregar la acción «consultar saldo»?"}

{"action":"answer","message":"**SAP** cumple el rol de facturación en el flujo. Su documentación indica:\n\n- Recibe la cuenta desde Salesforce\n- Genera el contrato"}

{"action":"propose_create","message":"Propongo documentar ForceBeat como sistema nuevo.","draft":{"nombre":"ForceBeat","descripcion":"Capa de orquestación entre Salesforce y los sistemas operativos.","rol":"Coordina el envío de la cuenta hacia OPERA y SAP.","url":null,"contenido":"## ForceBeat\n\nForceBeat orquesta..."}}

{"action":"propose_edit","message":"Amplío la documentación de OPERA con el detalle de los flujos.","targetNombre":"OPERA","patch":{"contenido":"## OPERA\n\nDocumentación ampliada...\n\n### Flujos\n..."}}

{"action":"propose_create_accion","message":"Propongo añadir a OPERA la acción «Crear reserva».","targetNombre":"OPERA","draft":{"titulo":"Crear reserva","tipo":"procedimiento","contenido":"## Crear reserva\n\n1. Abrir OPERA\n2. ...","pasos":[]}}

{"action":"propose_create_accion","message":"Propongo el flujo «Crear cuenta completa» que cruza Salesforce, OPERA y SAP.","targetNombre":"Salesforce","draft":{"titulo":"Crear cuenta completa","tipo":"flujo","contenido":null,"pasos":[{"sistema":"Salesforce","accion":"Registrar el caso","dato":"ID del caso"},{"sistema":"OPERA","accion":"Crear reserva con el ID del caso","dato":"código de reserva"},{"sistema":"SAP","accion":"Facturar con el código de reserva","dato":"nº de contrato"}]}}

{"action":"propose_edit_accion","message":"Inserto un paso de validación en eCO entre Salesforce y OPERA, y actualizo el detalle.","targetTitulo":"Crear cuenta completa","targetSistema":"Salesforce","pasos":[{"sistema":"Salesforce","accion":"Registrar el caso","dato":"ID del caso"},{"sistema":"eCO","accion":"Validar datos del cliente","dato":"OK validación"},{"sistema":"OPERA","accion":"Crear reserva con el ID del caso","dato":"código de reserva"},{"sistema":"SAP","accion":"Facturar con el código de reserva","dato":"nº de contrato"}],"contenido":"## Crear cuenta completa\n\nFlujo entre sistemas...\n\n1. Salesforce: registrar el caso → ID\n2. eCO: validar datos → OK\n3. OPERA: crear reserva → código\n4. SAP: facturar → contrato"}

Si el usuario dice "sí"/"confirma" a un borrador previo, repite el último propose tal cual.`;

function summarizeSistemas(sistemas: Sistema[]): string {
  if (sistemas.length === 0)
    return '(sin sistemas documentados aún)';
  return sistemas
    .map((s) => {
      const nombre = s.nombre ?? '(sin nombre)';
      const rol = s.rol?.trim() ? truncate(s.rol, 80) : '—';
      const desc = s.descripcion?.trim() ? truncate(s.descripcion, 120) : '—';
      return `- ${nombre} · rol: ${rol} · ${desc}`;
    })
    .join('\n');
}

function summarizeAcciones(
  sistemas: Sistema[],
  acciones: SistemaSeccion[]
): string {
  if (acciones.length === 0) return '(sin acciones registradas aún)';
  const nameById = new Map<string, string>();
  sistemas.forEach((s) => nameById.set(s.id, s.nombre ?? '(sin nombre)'));
  return acciones
    .map((a) => {
      const sistema = nameById.get(a.sistema_id) ?? '(sistema desconocido)';
      const titulo = a.titulo?.trim() ? a.titulo.trim() : '(sin título)';
      const tipo = a.tipo?.trim() ? a.tipo.trim() : 'acción';
      const pasos = Array.isArray(a.pasos) ? a.pasos : [];
      const pasosTxt = pasos.length
        ? pasos
            .map((p, i) => {
              const sn = nameById.get(p.sistema_id) ?? '(sistema)';
              const dato = p.dato?.trim() ? ` → ${p.dato.trim()}` : '';
              return `    ${i + 1}. ${sn}: ${p.accion ?? ''}${dato}`;
            })
            .join('\n')
        : '    (sin pasos)';
      const detalle = a.contenido?.trim()
        ? truncate(a.contenido, 600)
        : '(sin detalle)';
      return `### ${sistema} › ${titulo} (${tipo})\n  Detalle: ${detalle}\n  Pasos:\n${pasosTxt}`;
    })
    .join('\n\n');
}

function truncate(s: string, n: number): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function normalizeAccionPasos(raw: unknown): AccionDraftPaso[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      if (!p || typeof p !== 'object') return null;
      const src = p as Record<string, unknown>;
      const sistema = typeof src.sistema === 'string' ? src.sistema.trim() : '';
      const accion = typeof src.accion === 'string' ? src.accion : '';
      const dato = typeof src.dato === 'string' ? src.dato : '';
      if (!sistema) return null;
      return { sistema, accion, dato };
    })
    .filter((p): p is AccionDraftPaso => p !== null);
}

function normalizeAccionDraft(raw: Partial<AccionDraft> | undefined): AccionDraft {
  const d = raw ?? {};
  return {
    titulo: typeof d.titulo === 'string' ? d.titulo : '',
    tipo: typeof d.tipo === 'string' && d.tipo.trim() ? d.tipo : null,
    contenido: d.contenido ?? null,
    pasos: normalizeAccionPasos((d as { pasos?: unknown }).pasos),
  };
}

function normalizeDraft(raw: Partial<SistemaDraft> | undefined): SistemaDraft {
  const d = raw ?? {};
  return {
    nombre: typeof d.nombre === 'string' ? d.nombre : '',
    descripcion: d.descripcion ?? null,
    rol: d.rol ?? null,
    url: d.url ?? null,
    contenido: d.contenido ?? null,
  };
}

const DRAFT_KEYS: (keyof SistemaDraft)[] = [
  'nombre',
  'descripcion',
  'rol',
  'url',
  'contenido',
];

// Patch parcial: deja SOLO claves válidas de SistemaDraft (no fuerza todos los campos).
function normalizePatch(raw: unknown): Partial<SistemaDraft> {
  if (!raw || typeof raw !== 'object') return {};
  const src = raw as Record<string, unknown>;
  const out: Partial<SistemaDraft> = {};
  for (const key of DRAFT_KEYS) {
    if (!(key in src)) continue;
    const v = src[key];
    if (typeof v === 'string' || v === null) {
      (out as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}

function looksLikeQuestion(
  messages: { role: string; content: string }[]
): boolean {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  if (!last) return false;
  const t = last.content.toLowerCase();
  if (t.includes('?') || t.includes('¿')) return true;
  return /\b(cu[aá]nt|qu[eé]|cu[aá]l|c[oó]mo|d[oó]nde|qui[eé]n|mu[eé]stra|lista|enumera|hay)\b/.test(
    t
  );
}

const PASOS_SYSTEM = (nombres: string) => `Eres un asistente que documenta ACCIONES operativas que pueden ATRAVESAR VARIOS SISTEMAS. Hablas en español.

Te dan el título de una acción, su detalle actual (markdown, puede estar vacío) y una DESCRIPCIÓN en lenguaje natural de lo que el usuario quiere documentar (los pasos del flujo). Debes:
1. Diseñar los PASOS ORDENADOS del flujo: en qué sistema ocurre cada paso, qué se hace ahí y qué DATO se obtiene para llevar al siguiente paso.
2. Completar/mejorar el DETALLE en markdown de la acción (campo "contenido"), integrando lo que ya había y la descripción dada. Usa listas o secciones claras.

## Sistemas disponibles (usa los nombres EXACTOS de esta lista)
${nombres}

## Reglas
- Usa SOLO sistemas de la lista. No inventes sistemas.
- Ordena los pasos en el orden lógico del flujo. El primer paso es donde empieza la acción.
- "dato" = el dato que se obtiene en ese paso y se usa en el siguiente (o "" si no aplica).
- Si la acción es de un solo sistema, devuelve un único paso.
- "contenido": markdown útil y real (no placeholder). Conserva lo que ya estaba en el detalle y extiéndelo; no borres información válida.
- No inventes datos que no se deduzcan de la descripción o el contexto; si dudas, deja "dato" en "".

## Salida — SOLO JSON válido, sin texto alrededor
{"contenido":"<detalle en markdown>","pasos":[{"sistema":"<nombre exacto>","accion":"<qué se hace>","dato":"<dato para el siguiente paso o ''>"}]}`;

/** Propone los pasos del flujo y completa el detalle markdown de una acción. */
export async function suggestAccionPasos(
  input: {
    titulo: string;
    contenido?: string | null;
    descripcion?: string | null;
    sistemaInicial?: string | null;
  },
  sistemas: Sistema[]
): Promise<{ pasos: AccionDraftPaso[]; contenido: string | null }> {
  const nombres =
    sistemas.length > 0
      ? sistemas.map((s) => `- ${s.nombre}`).join('\n')
      : '(sin sistemas: no puedes proponer pasos)';
  if (sistemas.length === 0) return { pasos: [], contenido: null };

  const user = JSON.stringify({
    titulo: input.titulo,
    detalle_actual: input.contenido ?? '',
    descripcion: input.descripcion ?? '',
    sistema_inicial: input.sistemaInicial ?? null,
  });

  const result = await runAgent({
    system: PASOS_SYSTEM(nombres),
    messages: [{ role: 'user', content: user }],
    temperature: 0.3,
    responseFormat: 'json_object',
    tools: false,
  });

  function extractJson(raw: string): string {
    let s = (raw ?? '').trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    const first = s.indexOf('{');
    const last = s.lastIndexOf('}');
    if (first >= 0 && last > first) s = s.slice(first, last + 1);
    return s;
  }

  try {
    const parsed = JSON.parse(extractJson(result.content)) as {
      pasos?: unknown;
      contenido?: unknown;
    };
    return {
      pasos: normalizeAccionPasos(parsed.pasos),
      contenido:
        typeof parsed.contenido === 'string' && parsed.contenido.trim()
          ? parsed.contenido
          : null,
    };
  } catch {
    return { pasos: [], contenido: null };
  }
}

export async function sistemasAssistant(
  messages: { role: 'user' | 'assistant'; content: string; images?: string[] }[],
  sistemas: Sistema[],
  acciones: SistemaSeccion[] = []
): Promise<SistemaAiResult> {
  // Si hay capturas adjuntas, usamos Gemini (multimodal); Groq llama-3.3 es solo texto.
  const hasImages = messages.some((m) => m.images && m.images.length > 0);
  const result = await runAgent({
    system: SYSTEM(
      summarizeSistemas(sistemas),
      summarizeAcciones(sistemas, acciones)
    ),
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
        'No pude generar una respuesta. ¿Puedes reformular tu pregunta o decir qué sistema quieres documentar?',
    };
  }

  // Infiere la acción si falta o es inválida (en vez de reventar con 500).
  const VALID_ACTIONS = [
    'clarify',
    'answer',
    'propose_create',
    'propose_edit',
    'propose_create_accion',
    'propose_edit_accion',
  ];
  let action = parsed.action as string | undefined;
  if (!action || !VALID_ACTIONS.includes(action)) {
    // Un draft con "titulo" (sin "nombre") es una acción, no un sistema.
    const draftObj = parsed.draft as Record<string, unknown> | undefined;
    if (parsed.targetTitulo && parsed.pasos) action = 'propose_edit_accion';
    else if (draftObj && 'titulo' in draftObj && !('nombre' in draftObj))
      action = 'propose_create_accion';
    else if (parsed.draft) action = 'propose_create';
    else if (parsed.patch) action = 'propose_edit';
    else if (parsed.targetNombre) action = 'propose_edit';
    else if (
      typeof parsed.message === 'string' &&
      parsed.message.trim() &&
      looksLikeQuestion(messages)
    )
      action = 'answer';
    else if (typeof parsed.message === 'string' && parsed.message.trim())
      action = 'answer';
    else action = 'clarify';
  }

  const message =
    typeof parsed.message === 'string' && parsed.message.trim()
      ? parsed.message
      : action === 'clarify'
        ? '¿Puedes dar más detalle?'
        : action === 'answer'
          ? 'No tengo documentación para responder eso.'
          : 'Propuesta lista para revisar.';

  if (action === 'answer') {
    return { action, message };
  }

  if (action === 'propose_create') {
    // Soporta tanto {draft:{...}} como los campos del draft al nivel raíz.
    const draftSource =
      (parsed.draft as Partial<SistemaDraft>) ?? (parsed as Partial<SistemaDraft>);
    const draft = normalizeDraft(draftSource);
    if (!draft.nombre.trim()) {
      return {
        action: 'clarify',
        message:
          '¿Qué sistema quieres documentar? Indícame al menos su nombre.',
      };
    }
    return { action, message, draft };
  }

  if (action === 'propose_edit') {
    const targetNombre =
      typeof parsed.targetNombre === 'string' ? parsed.targetNombre : '';
    const patch = normalizePatch(parsed.patch);
    if (!targetNombre.trim() || Object.keys(patch).length === 0) {
      return {
        action: 'clarify',
        message:
          typeof parsed.message === 'string' && parsed.message.trim()
            ? parsed.message
            : '¿Qué sistema quieres editar y qué cambio quieres aplicar?',
      };
    }
    return { action, message, targetNombre, patch };
  }

  if (action === 'propose_create_accion') {
    const targetNombre =
      typeof parsed.targetNombre === 'string' ? parsed.targetNombre : '';
    const draftSource =
      (parsed.draft as Partial<AccionDraft>) ?? (parsed as Partial<AccionDraft>);
    const draft = normalizeAccionDraft(draftSource);
    if (!targetNombre.trim()) {
      return {
        action: 'clarify',
        message:
          typeof parsed.message === 'string' && parsed.message.trim()
            ? parsed.message
            : '¿A qué sistema pertenece esta acción?',
      };
    }
    if (!draft.titulo.trim()) {
      return {
        action: 'clarify',
        message: '¿Qué acción quieres añadir? Indícame al menos su título.',
      };
    }
    return { action, message, targetNombre, draft };
  }

  if (action === 'propose_edit_accion') {
    const targetTitulo =
      typeof parsed.targetTitulo === 'string' ? parsed.targetTitulo : '';
    const targetSistema =
      typeof parsed.targetSistema === 'string' ? parsed.targetSistema : '';
    const pasos = normalizeAccionPasos(parsed.pasos);
    const contenido =
      typeof parsed.contenido === 'string' && parsed.contenido.trim()
        ? parsed.contenido
        : null;
    if (!targetTitulo.trim() || (pasos.length === 0 && !contenido)) {
      return {
        action: 'clarify',
        message:
          typeof parsed.message === 'string' && parsed.message.trim()
            ? parsed.message
            : '¿Qué acción quieres modificar y qué paso quieres añadir?',
      };
    }
    return { action, message, targetTitulo, targetSistema, pasos, contenido };
  }

  return { action: 'clarify', message };
}
