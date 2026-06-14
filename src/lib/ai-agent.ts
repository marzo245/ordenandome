import { TOOL_DEFS, TOOL_EXECUTORS, type ToolExecutor } from './ai-tools';

export type AiProvider = 'groq' | 'gemini';

interface ProviderConfig {
  endpoint: string;
  model: string;
  authHeader: string;
}

function providerConfig(provider: AiProvider): ProviderConfig {
  if (provider === 'gemini') {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY no configurada');
    return {
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
      authHeader: `Bearer ${key}`,
    };
  }
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY no configurada');
  return {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
    authHeader: `Bearer ${key}`,
  };
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

export interface AgentResult {
  content: string;
  toolCalls: number;
  iterations: number;
  provider: AiProvider;
  model: string;
}

export async function runAgent(opts: RunAgentOptions): Promise<AgentResult> {
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

  const cfg = providerConfig(provider);

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
        throw new Error(
          `${provider} ${res.status}: ${errText}\nFallback sin herramientas: ${fallbackRes.status}: ${await fallbackRes.text()}`
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
