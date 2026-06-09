export interface NewsItem {
  id: string;
  title: string;
  url: string | null;
  hn_url: string;
  points: number;
  num_comments: number;
  created_at: string;
  niche: NicheKey;
  niche_label: string;
}

export type NicheKey = 'dev' | 'ai' | 'sec' | 'startup';

interface Niche {
  key: NicheKey;
  label: string;
  query: string;
}

const NICHES: Niche[] = [
  {
    key: 'dev',
    label: 'Dev / Web',
    query: '(typescript OR react OR nextjs OR rust OR golang OR node OR webdev)',
  },
  {
    key: 'ai',
    label: 'IA / LLM',
    query: '(LLM OR GPT OR claude OR anthropic OR openai OR llama OR agent OR RAG)',
  },
  {
    key: 'sec',
    label: 'Seguridad',
    query: '(CVE OR vulnerability OR breach OR exploit OR ransomware OR zero-day)',
  },
  {
    key: 'startup',
    label: 'Startups',
    query: '(startup OR "Y Combinator" OR "Series A" OR funding OR launch)',
  },
];

interface HnHit {
  objectID: string;
  title: string;
  url: string | null;
  points: number;
  num_comments: number;
  created_at: string;
}

async function fetchNiche(n: Niche, perNiche: number): Promise<NewsItem[]> {
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(
    n.query
  )}&tags=story&hitsPerPage=${perNiche}&numericFilters=points>15`;

  const res = await fetch(url, { next: { revalidate: 600 } });
  if (!res.ok) return [];
  const data = (await res.json()) as { hits: HnHit[] };

  return data.hits
    .filter((h) => h.title)
    .map((h) => ({
      id: h.objectID,
      title: h.title,
      url: h.url,
      hn_url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      points: h.points,
      num_comments: h.num_comments,
      created_at: h.created_at,
      niche: n.key,
      niche_label: n.label,
    }));
}

export async function fetchNews(perNiche = 6): Promise<NewsItem[]> {
  const results = await Promise.all(NICHES.map((n) => fetchNiche(n, perNiche)));
  const all = results.flat();

  const seen = new Set<string>();
  const dedup: NewsItem[] = [];
  for (const it of all) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    dedup.push(it);
  }

  dedup.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  return dedup;
}

export const NICHE_KEYS: NicheKey[] = NICHES.map((n) => n.key);
export const NICHE_LABELS: Record<NicheKey, string> = NICHES.reduce(
  (acc, n) => ({ ...acc, [n.key]: n.label }),
  {} as Record<NicheKey, string>
);
