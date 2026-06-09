import { XMLParser } from 'fast-xml-parser';

export type NicheKey = 'dev' | 'ai' | 'sec' | 'startup';

export type SourceKey =
  | 'hn'
  | 'devto'
  | 'reddit'
  | 'lobsters'
  | 'krebs'
  | 'thn'
  | 'arxiv';

export interface NewsItem {
  id: string;
  title: string;
  url: string | null;
  hn_url?: string;
  comments_url: string;
  points: number;
  num_comments: number;
  created_at: string;
  niche: NicheKey;
  niche_label: string;
  source: SourceKey;
  source_label: string;
}

export const NICHE_LABELS: Record<NicheKey, string> = {
  dev: 'Dev / Web',
  ai: 'IA / LLM',
  sec: 'Seguridad',
  startup: 'Startups',
};

export const SOURCE_LABELS: Record<SourceKey, string> = {
  hn: 'HN',
  devto: 'Dev.to',
  reddit: 'Reddit',
  lobsters: 'Lobsters',
  krebs: 'Krebs',
  thn: 'THN',
  arxiv: 'arXiv',
};

// ---------- per-niche source config ----------

const HN_QUERIES: Record<NicheKey, string> = {
  dev: '(typescript OR react OR nextjs OR rust OR golang OR node OR webdev)',
  ai: '(LLM OR GPT OR claude OR anthropic OR openai OR llama OR agent OR RAG)',
  sec: '(CVE OR vulnerability OR breach OR exploit OR ransomware OR zero-day)',
  startup: '(startup OR "Y Combinator" OR "Series A" OR funding OR launch)',
};

const DEVTO_TAGS: Record<NicheKey, string> = {
  dev: 'webdev',
  ai: 'ai',
  sec: 'security',
  startup: 'startup',
};

const REDDIT_SUBS: Record<NicheKey, string> = {
  dev: 'programming',
  ai: 'MachineLearning',
  sec: 'netsec',
  startup: 'startups',
};

// ---------- helpers ----------

const PER_SOURCE = 4;
const FETCH_TIMEOUT_MS = 6000;

async function safeFetch(url: string, init?: RequestInit): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      cache: 'no-store',
      headers: {
        'User-Agent': 'calendario-inteligente/1.0 (+https://github.com/marzo245/ordenandome)',
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function makeId(source: SourceKey, raw: string): string {
  return `${source}:${raw}`;
}

// ---------- Hacker News ----------

interface HnHit {
  objectID: string;
  title: string;
  url: string | null;
  points: number;
  num_comments: number;
  created_at: string;
}

async function fetchHn(niche: NicheKey): Promise<NewsItem[]> {
  const q = HN_QUERIES[niche];
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=${PER_SOURCE}`;
  const res = await safeFetch(url);
  if (!res?.ok) return [];
  const data = (await res.json()) as { hits: HnHit[] };
  return (data.hits ?? [])
    .filter((h) => h.title)
    .map((h) => ({
      id: makeId('hn', h.objectID),
      title: h.title,
      url: h.url,
      hn_url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      comments_url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      points: h.points,
      num_comments: h.num_comments,
      created_at: h.created_at,
      niche,
      niche_label: NICHE_LABELS[niche],
      source: 'hn',
      source_label: SOURCE_LABELS.hn,
    }));
}

// ---------- Dev.to ----------

interface DevtoArticle {
  id: number;
  title: string;
  url: string;
  comments_count: number;
  public_reactions_count: number;
  published_at: string;
}

async function fetchDevto(niche: NicheKey): Promise<NewsItem[]> {
  const tag = DEVTO_TAGS[niche];
  const url = `https://dev.to/api/articles?tag=${tag}&per_page=${PER_SOURCE}&top=7`;
  const res = await safeFetch(url);
  if (!res?.ok) return [];
  const data = (await res.json()) as DevtoArticle[];
  return data.map((a) => ({
    id: makeId('devto', String(a.id)),
    title: a.title,
    url: a.url,
    comments_url: a.url,
    points: a.public_reactions_count,
    num_comments: a.comments_count,
    created_at: a.published_at,
    niche,
    niche_label: NICHE_LABELS[niche],
    source: 'devto',
    source_label: SOURCE_LABELS.devto,
  }));
}

// ---------- Reddit ----------

interface RedditChild {
  data: {
    id: string;
    title: string;
    url: string;
    permalink: string;
    score: number;
    num_comments: number;
    created_utc: number;
  };
}

async function fetchReddit(niche: NicheKey): Promise<NewsItem[]> {
  const sub = REDDIT_SUBS[niche];
  const url = `https://www.reddit.com/r/${sub}/top.json?t=week&limit=${PER_SOURCE}`;
  const res = await safeFetch(url);
  if (!res?.ok) return [];
  const data = (await res.json()) as { data: { children: RedditChild[] } };
  return (data.data?.children ?? []).map((c) => ({
    id: makeId('reddit', c.data.id),
    title: c.data.title,
    url: c.data.url,
    comments_url: `https://www.reddit.com${c.data.permalink}`,
    points: c.data.score,
    num_comments: c.data.num_comments,
    created_at: new Date(c.data.created_utc * 1000).toISOString(),
    niche,
    niche_label: NICHE_LABELS[niche],
    source: 'reddit',
    source_label: SOURCE_LABELS.reddit,
  }));
}

// ---------- Lobste.rs (solo dev) ----------

interface LobsterStory {
  short_id: string;
  title: string;
  url: string;
  score: number;
  comment_count: number;
  created_at: string;
  comments_url: string;
}

async function fetchLobsters(): Promise<NewsItem[]> {
  const res = await safeFetch('https://lobste.rs/hottest.json');
  if (!res?.ok) return [];
  const data = (await res.json()) as LobsterStory[];
  return data.slice(0, PER_SOURCE).map((s) => ({
    id: makeId('lobsters', s.short_id),
    title: s.title,
    url: s.url || s.comments_url,
    comments_url: s.comments_url,
    points: s.score,
    num_comments: s.comment_count,
    created_at: s.created_at,
    niche: 'dev',
    niche_label: NICHE_LABELS.dev,
    source: 'lobsters',
    source_label: SOURCE_LABELS.lobsters,
  }));
}

// ---------- RSS parsers ----------

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

interface RssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  guid?: string | { '#text': string };
}

async function fetchRss(
  feedUrl: string,
  source: SourceKey,
  niche: NicheKey
): Promise<NewsItem[]> {
  const res = await safeFetch(feedUrl);
  if (!res?.ok) return [];
  const xml = await res.text();
  const parsed = xmlParser.parse(xml) as {
    rss?: { channel?: { item?: RssItem[] | RssItem } };
    feed?: { entry?: AtomEntry[] | AtomEntry };
  };

  const items = parsed.rss?.channel?.item;
  if (items) {
    const arr = Array.isArray(items) ? items : [items];
    return arr.slice(0, PER_SOURCE).map((it, i) => {
      const guidStr =
        typeof it.guid === 'string' ? it.guid : it.guid?.['#text'] ?? `${i}`;
      return {
        id: makeId(source, guidStr),
        title: it.title ?? '(sin título)',
        url: it.link ?? null,
        comments_url: it.link ?? '#',
        points: 0,
        num_comments: 0,
        created_at: it.pubDate ? new Date(it.pubDate).toISOString() : new Date().toISOString(),
        niche,
        niche_label: NICHE_LABELS[niche],
        source,
        source_label: SOURCE_LABELS[source],
      };
    });
  }

  // Atom (arXiv)
  const entries = parsed.feed?.entry;
  if (entries) {
    const arr = Array.isArray(entries) ? entries : [entries];
    return arr.slice(0, PER_SOURCE).map((e, i) => {
      const link = Array.isArray(e.link)
        ? e.link.find((l) => l['@_rel'] === 'alternate')?.['@_href'] ?? e.link[0]?.['@_href']
        : e.link?.['@_href'];
      return {
        id: makeId(source, e.id ?? `${i}`),
        title: (e.title ?? '(sin título)').replace(/\s+/g, ' ').trim(),
        url: link ?? null,
        comments_url: link ?? '#',
        points: 0,
        num_comments: 0,
        created_at: e.published ?? e.updated ?? new Date().toISOString(),
        niche,
        niche_label: NICHE_LABELS[niche],
        source,
        source_label: SOURCE_LABELS[source],
      };
    });
  }

  return [];
}

interface AtomEntry {
  id?: string;
  title?: string;
  published?: string;
  updated?: string;
  link?: { '@_href'?: string; '@_rel'?: string } | { '@_href'?: string; '@_rel'?: string }[];
}

async function fetchKrebs(): Promise<NewsItem[]> {
  return fetchRss('https://krebsonsecurity.com/feed/', 'krebs', 'sec');
}

async function fetchThn(): Promise<NewsItem[]> {
  return fetchRss('https://feeds.feedburner.com/TheHackersNews', 'thn', 'sec');
}

async function fetchArxiv(): Promise<NewsItem[]> {
  const url =
    'http://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL&max_results=6&sortBy=submittedDate&sortOrder=descending';
  return fetchRss(url, 'arxiv', 'ai');
}

// ---------- orchestrator ----------

export interface NewsDebug {
  items: NewsItem[];
  perSource: Partial<Record<SourceKey, number>>;
  errors: { source: SourceKey; error: string }[];
}

async function safeRun(
  source: SourceKey,
  fn: () => Promise<NewsItem[]>,
  errors: { source: SourceKey; error: string }[]
): Promise<NewsItem[]> {
  try {
    return await fn();
  } catch (e) {
    errors.push({ source, error: (e as Error).message });
    return [];
  }
}

export async function fetchNewsWithDebug(): Promise<NewsDebug> {
  const errors: { source: SourceKey; error: string }[] = [];
  const niches: NicheKey[] = ['dev', 'ai', 'sec', 'startup'];

  // Por nicho: HN + Dev.to + Reddit. Más fuentes específicas.
  const tasks: Promise<NewsItem[]>[] = [];
  for (const n of niches) {
    tasks.push(safeRun('hn', () => fetchHn(n), errors));
    tasks.push(safeRun('devto', () => fetchDevto(n), errors));
    tasks.push(safeRun('reddit', () => fetchReddit(n), errors));
  }
  tasks.push(safeRun('lobsters', fetchLobsters, errors));
  tasks.push(safeRun('krebs', fetchKrebs, errors));
  tasks.push(safeRun('thn', fetchThn, errors));
  tasks.push(safeRun('arxiv', fetchArxiv, errors));

  const results = await Promise.all(tasks);
  const all = results.flat();

  // Dedupe por URL o id
  const seen = new Set<string>();
  const dedup: NewsItem[] = [];
  for (const it of all) {
    const key = it.url ?? it.id;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(it);
  }

  // Sort por mezcla: priorizar items con score alto, romper empates por recencia
  dedup.sort((a, b) => {
    const sa = (a.points ?? 0) + (a.num_comments ?? 0) * 0.5;
    const sb = (b.points ?? 0) + (b.num_comments ?? 0) * 0.5;
    if (sa !== sb) return sb - sa;
    return +new Date(b.created_at) - +new Date(a.created_at);
  });

  const perSource: Partial<Record<SourceKey, number>> = {};
  for (const it of dedup) {
    perSource[it.source] = (perSource[it.source] ?? 0) + 1;
  }

  return { items: dedup, perSource, errors };
}

export async function fetchNews(): Promise<NewsItem[]> {
  const result = await fetchNewsWithDebug();
  return result.items;
}
