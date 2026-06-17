'use client';

import { useEffect, useState } from 'react';
import type { NewsItem, NicheKey } from '@/lib/news';
import { NICHE_LABELS, SOURCE_LABELS } from '@/lib/news';

const NICHE_COLOR: Record<NicheKey, string> = {
  dev: 'var(--accent)',
  ai: 'var(--warn)',
  sec: 'var(--danger)',
  startup: 'var(--muted)',
};

type Filter = 'all' | NicheKey;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todo' },
  { key: 'dev', label: 'Dev' },
  { key: 'ai', label: 'IA' },
  { key: 'sec', label: 'Sec' },
  { key: 'startup', label: 'Startups' },
];

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.round(diff / 60)}m`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h`;
  return `${Math.round(diff / 86400)}d`;
}

function hostFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Feed de noticias técnicas por nicho; las carga de `/api/news` y permite filtrar. */
export default function NewsFeed() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/news');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setItems(data.items ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const visible =
    filter === 'all' ? items : items.filter((i) => i.niche === filter);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">
          Noticias
        </h2>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-50"
        >
          {loading ? '…' : 'actualizar'}
        </button>
      </div>

      <nav className="flex flex-wrap gap-3 mb-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs transition-colors ${
              filter === f.key
                ? 'text-[var(--text)] underline underline-offset-4 decoration-[var(--text)]'
                : 'text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </nav>

      <div className="space-y-2 max-h-[360px] overflow-auto">
        {loading && (
          <p className="text-xs mono text-[var(--muted)]">cargando…</p>
        )}
        {error && (
          <p className="text-xs mono text-[var(--danger)]">
            Error: {error}
          </p>
        )}
        {!loading && !error && visible.length === 0 && (
          <p className="text-sm text-[var(--muted)]">
            Sin noticias para este filtro.
          </p>
        )}
        {visible.map((it) => {
          const host = hostFromUrl(it.url);
          return (
            <article key={it.id} className="py-1">
              <a
                href={it.url ?? it.comments_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-[var(--text)] hover:text-[var(--accent)] flex items-start gap-2"
              >
                <span
                  aria-hidden
                  className="inline-block w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
                  style={{ background: NICHE_COLOR[it.niche] }}
                />
                <span className="flex-1">{it.title}</span>
              </a>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[10px] mono text-[var(--muted)] uppercase pl-[14px]">
                <span>{SOURCE_LABELS[it.source]}</span>
                <span>·</span>
                <span>{NICHE_LABELS[it.niche]}</span>
                {host && (
                  <>
                    <span>·</span>
                    <span>{host}</span>
                  </>
                )}
                {(it.points > 0 || it.num_comments > 0) && (
                  <>
                    <span>·</span>
                    {it.points > 0 && <span>{it.points}↑</span>}
                    {it.num_comments > 0 && (
                      <a
                        href={it.comments_url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-[var(--text)]"
                      >
                        {it.num_comments} 💬
                      </a>
                    )}
                  </>
                )}
                <span>·</span>
                <span>{relativeTime(it.created_at)}</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
