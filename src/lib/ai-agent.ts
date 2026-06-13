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

interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
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
  messages: { role: 'user' | 'assistant'; content: string }[];
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
    ...messages.map((m) => ({ role: m.role, content: m.content })),
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

    if (!res.ok) throw new Error(`${provider} ${res.status}: ${await res.text()}`);
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
      content: msg.content ?? '',
      toolCalls,
      iterations,
      provider,
      model: cfg.model,
    };
  }

  throw new Error('agent exhausted maxToolHops');
}
