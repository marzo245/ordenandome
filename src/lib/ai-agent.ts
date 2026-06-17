/**
 * Núcleo de IA de la app: `runAgent()`.
 *
 * Único punto de llamada al LLM. Habla el formato OpenAI-compatible, por lo que
 * sirve tanto para Groq (rápido, default) como para Gemini (multimodal /
 * razonamiento). Implementa el bucle de tool-calling: pide al modelo, ejecuta
 * las tools que pida, le devuelve los resultados y repite hasta `maxToolHops`.
 *
 * Soporta contenido multimodal (imágenes por mensaje) y `response_format`
 * JSON para los asistentes de dominio que devuelven una `action`.
 */
import { TOOL_DEFS, TOOL_EXECUTORS, type ToolExecutor } from './ai-tools';

/** Proveedores LLM soportados (ambos vía API OpenAI-compatible). */
export type AiProvider = 'groq' | 'gemini';

/** Se lanza cuando un proveedor devuelve 429 (cuota/rate limit agotado). */
class RateLimitError extends Error {
  constructor(public provider: AiProvider, public detail: string) {
    super(`${provider} 429: ${detail}`);
    this.name = 'RateLimitError';
  }
}

/**
 * Se lanza ante errores transitorios del proveedor (503/502/529: sobrecarga o
 * indisponibilidad temporal). A diferencia del 429 de cuota, suelen recuperarse
 * en segundos, así que {@link runAgent} reintenta con backoff antes de fallar.
 */
class TransientError extends Error {
  constructor(public provider: AiProvider, public status: number, public detail: string) {
    super(`${provider} ${status}: ${detail}`);
    this.name = 'TransientError';
  }
}

/** Estados HTTP transitorios: el modelo está saturado o temporalmente caído. */
const TRANSIENT_STATUSES = new Set([502, 503, 529]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Configuración resuelta de un proveedor: a dónde llamar, con qué modelo y auth. */
interface ProviderConfig {
  endpoint: string;
  model: string;
  authHeader: string;
}

/** Un intento de la cadena de failover: proveedor + la API key concreta a usar. */
interface Attempt {
  provider: AiProvider;
  key: string;
}

/**
 * Resuelve endpoint, modelo y cabecera de auth para el proveedor dado,
 * usando la API key concreta del intento.
 */
function providerConfig(provider: AiProvider, key: string): ProviderConfig {
  if (provider === 'gemini') {
    return {
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
      authHeader: `Bearer ${key}`,
    };
  }
  return {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
    authHeader: `Bearer ${key}`,
  };
}

/**
 * Construye la cadena de intentos según el proveedor pedido y las keys del entorno.
 * - `groq`: todas las keys de Groq en orden (`GROQ_API_KEY`, `GROQ_API_KEY_2`),
 *   y al final Gemini como último recurso si está configurado.
 * - `gemini`: solo Gemini (no cae de vuelta a Groq; suele elegirse por multimodal).
 * Ante un 429, {@link runAgent} pasa al siguiente intento.
 * @throws Si no hay ninguna API key utilizable para el proveedor pedido.
 */
function buildAttempts(provider: AiProvider): Attempt[] {
  if (provider === 'gemini') {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY no configurada');
    return [{ provider: 'gemini', key }];
  }
  const attempts: Attempt[] = [];
  const groqKeys = [process.env.GROQ_API_KEY, process.env.GROQ_API_KEY_2].filter(
    (k): k is string => Boolean(k)
  );
  for (const key of groqKeys) attempts.push({ provider: 'groq', key });
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) attempts.push({ provider: 'gemini', key: geminiKey });
  if (attempts.length === 0) throw new Error('GROQ_API_KEY no configurada');
  return attempts;
}

/** Parte de contenido multimodal (texto o imagen) — formato OpenAI-compatible. */
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/** El contenido de respuesta del modelo siempre es texto; lo normalizamos a string. */
function contentToText(content: string | ContentPart[] | null | undefined): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p.type === 'text' ? p.text : ''))
      .join('');
  }
  return '';
}

/** Mensaje en el formato del wire OpenAI (incluye los roles `assistant`/`tool`
 *  internos del bucle de tool-calling, que no expone el llamador). */
interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[] | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

/** Opciones de entrada de {@link runAgent}. */
export interface RunAgentOptions {
  system: string;
  /** Cada mensaje puede llevar imágenes (URLs públicas o data URLs base64). */
  messages: { role: 'user' | 'assistant'; content: string; images?: string[] }[];
  temperature?: number;
  responseFormat?: 'text' | 'json_object';
  tools?: boolean;
  maxToolHops?: number;
  executors?: Record<string, ToolExecutor>;
  /** Provider: 'groq' (rápido, default) o 'gemini' (razonamiento profundo). */
  provider?: AiProvider;
}

/** Resultado de {@link runAgent}: el texto final + métricas de la ejecución. */
export interface AgentResult {
  content: string;
  toolCalls: number;
  iterations: number;
  provider: AiProvider;
  model: string;
}

/**
 * Ejecuta el agente: arma la conversación, llama al LLM y resuelve el bucle de
 * tool-calling hasta obtener una respuesta final o agotar `maxToolHops`.
 *
 * Detalles de robustez:
 * - En la última iteración (`isFinal`) se desactivan las tools y se fuerza el
 *   `response_format` JSON si se pidió, para garantizar una respuesta cerrada.
 * - Si Groq falla con `tool_use_failed` (HTTP 400), reintenta una vez SIN tools.
 * - Los resultados de cada tool se truncan a 8000 chars para no inflar el contexto.
 *
 * @param opts Ver {@link RunAgentOptions}.
 * @returns Contenido final (texto, ya normalizado a string) y métricas.
 * @throws Si el proveedor devuelve un error no recuperable o se agotan los hops.
 */
export async function runAgent(opts: RunAgentOptions): Promise<AgentResult> {
  const attempts = buildAttempts(opts.provider ?? 'groq');
  const MAX_TRANSIENT_RETRIES = 2; // reintentos extra del mismo proveedor ante 503/502/529
  let lastErr: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const { provider, key } = attempts[i];
    const isLast = i === attempts.length - 1;
    for (let retry = 0; ; retry++) {
      try {
        return await runAgentOnce({ ...opts, provider }, key);
      } catch (e) {
        lastErr = e;
        // Error transitorio (sobrecarga): reintenta el MISMO proveedor con
        // backoff antes de pasar al siguiente.
        if (e instanceof TransientError && retry < MAX_TRANSIENT_RETRIES) {
          await sleep(600 * (retry + 1)); // 0.6s, 1.2s
          continue;
        }
        // 429 (cuota) o transitorio ya agotado: pasamos al siguiente intento
        // (otra key de Groq, o finalmente Gemini) si queda alguno.
        if ((e instanceof RateLimitError || e instanceof TransientError) && !isLast) break;
        throw e;
      }
    }
  }
  throw lastErr;
}

/**
 * Ejecuta el agente contra un proveedor + key concretos (sin failover).
 * {@link runAgent} la envuelve para recorrer la cadena de intentos ante un 429.
 */
async function runAgentOnce(opts: RunAgentOptions, apiKey: string): Promise<AgentResult> {
  const {
    system,
    messages,
    temperature = 0.4,
    responseFormat = 'text',
    tools = true,
    maxToolHops = 4,
    executors = TOOL_EXECUTORS,
    provider = 'groq',
  } = opts;

  const cfg = providerConfig(provider, apiKey);

  const conversation: AgentMessage[] = [
    { role: 'system', content: system },
    ...messages.map((m): AgentMessage => {
      if (m.images && m.images.length > 0) {
        const parts: ContentPart[] = [];
        if (m.content) parts.push({ type: 'text', text: m.content });
        for (const url of m.images) {
          parts.push({ type: 'image_url', image_url: { url } });
        }
        return { role: m.role, content: parts };
      }
      return { role: m.role, content: m.content };
    }),
  ];

  let toolCalls = 0;
  let iterations = 0;

  for (let hop = 0; hop <= maxToolHops; hop++) {
    iterations++;
    const body: Record<string, unknown> = {
      model: cfg.model,
      temperature,
      messages: conversation,
    };

    const isFinal = hop === maxToolHops;
    if (tools && !isFinal) {
      body.tools = TOOL_DEFS;
      body.tool_choice = 'auto';
    }
    if (responseFormat === 'json_object' && (!tools || isFinal)) {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: cfg.authHeader,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      // Cuota agotada → lo propagamos para que runAgent reintente en otro proveedor.
      if (res.status === 429) throw new RateLimitError(provider, errText);
      // Sobrecarga/indisponibilidad temporal → runAgent reintenta con backoff.
      if (TRANSIENT_STATUSES.has(res.status)) throw new TransientError(provider, res.status, errText);
      const canRetryWithoutTools =
        provider === 'groq' &&
        tools &&
        !isFinal &&
        res.status === 400 &&
        errText.includes('tool_use_failed');

      if (!canRetryWithoutTools) throw new Error(`${provider} ${res.status}: ${errText}`);

      const fallbackMessages: AgentMessage[] = [
        ...conversation,
        {
          role: 'system',
          content:
            'La llamada a herramientas falló en el proveedor. Responde sin usar herramientas externas, usando solo el contexto disponible. Devuelve exclusivamente el formato final solicitado.',
        },
      ];
      const fallbackBody: Record<string, unknown> = {
        model: cfg.model,
        temperature,
        messages: fallbackMessages,
      };
      if (responseFormat === 'json_object') {
        fallbackBody.response_format = { type: 'json_object' };
      }

      const fallbackRes = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: cfg.authHeader,
        },
        body: JSON.stringify(fallbackBody),
      });

      if (!fallbackRes.ok) {
        const fbText = await fallbackRes.text();
        if (fallbackRes.status === 429) throw new RateLimitError(provider, fbText);
        if (TRANSIENT_STATUSES.has(fallbackRes.status))
          throw new TransientError(provider, fallbackRes.status, fbText);
        throw new Error(
          `${provider} ${res.status}: ${errText}\nFallback sin herramientas: ${fallbackRes.status}: ${fbText}`
        );
      }
      const fallbackData = await fallbackRes.json();
      const fallbackMsg = fallbackData.choices[0].message as AgentMessage;
      return {
        content: contentToText(fallbackMsg.content),
        toolCalls,
        iterations,
        provider,
        model: cfg.model,
      };
    }
    const data = await res.json();
    const msg = data.choices[0].message as AgentMessage;

    if (msg.tool_calls?.length && !isFinal) {
      conversation.push({
        role: 'assistant',
        content: msg.content ?? '',
        tool_calls: msg.tool_calls,
      });

      for (const call of msg.tool_calls) {
        toolCalls++;
        const fn = executors[call.function.name];
        let result: string;
        if (!fn) {
          result = `Error: tool desconocida ${call.function.name}`;
        } else {
          try {
            const args = JSON.parse(call.function.arguments || '{}');
            result = await fn(args);
          } catch (e) {
            result = `Error ejecutando ${call.function.name}: ${(e as Error).message}`;
          }
        }
        conversation.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.function.name,
          content: result.slice(0, 8000),
        });
      }
      continue;
    }

    return {
      content: contentToText(msg.content),
      toolCalls,
      iterations,
      provider,
      model: cfg.model,
    };
  }

  throw new Error('agent exhausted maxToolHops');
}
