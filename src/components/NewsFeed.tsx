'use client';

import { useEffect, useState } from 'react';
import type { NewsItem, NicheKey, SourceKey } from '@/lib/news';
import { NICHE_LABELS, SOURCE_LABELS } from '@/lib/news';

const NICHE_COLOR: Record<NicheKey, string> = {
  dev: 'var(--accent)',
  ai: 'var(--warn)',
  sec: 'var(--danger)',
  startup: 'var(--muted)',
};

const SOURCE_BADGE: Record<SourceKey, string> = {
  hn: 'bg-orange-700/30 text-orange-300',
  devto: 'bg-slate-600/40 text-slate-200',
  reddit: 'bg-red-800/30 text-red-300',
  lobsters: 'bg-amber-700/30 text-amber-300',
  krebs: 'bg-red-900/40 text-red-300',
  thn: 'bg-red-900/40 text-red-300',
  arxiv: 'bg-purple-700/30 text-purple-300',
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
    <div className="border border-[var(--border)] bg-[var(--surface)]">
      <div className="px-4 py-2 border-b border-[var(--border)] flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Noticias del nicho</h2>
        <button
          onClick={load}
          disabled={loading}
          className="mono text-[10px] text-[var(--accent)] hover:underline disabled:opacity-50"
        >
          {loading ? '…' : '↻ HN'}
        </button>
      </div>

      <nav className="flex flex-wrap gap-1 px-2 py-2 border-b border-[var(--border)]">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`mono text-[11px] px-2 py-1 border transition-colors ${
              filter === f.key
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </nav>

      <div className="p-2 space-y-1 max-h-[420px] overflow-auto">
        {loading && (
          <p className="text-xs mono text-[var(--muted)] p-2">cargando…</p>
        )}
        {error && (
          <p className="text-xs mono text-[var(--danger)] p-2">
            Error: {error}
          </p>
        )}
        {!loading && !error && visible.length === 0 && (
          <p className="text-sm text-[var(--muted)] p-2">
            Sin noticias para este filtro.
          </p>
        )}
        {visible.map((it) => {
          const host = hostFromUrl(it.url);
          return (
            <article
              key={it.id}
              className="px-2 py-1.5 hover:bg-[var(--bg)] border-l-2 transition-colors"
              style={{ borderColor: NICHE_COLOR[it.niche] }}
            >
              <a
                href={it.url ?? it.comments_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-[var(--text)] hover:text-[var(--accent)] flex items-start gap-2"
              >
                <span
                  className={`mono text-[9px] px-1.5 py-0.5 shrink-0 mt-0.5 ${SOURCE_BADGE[it.source]}`}
                >
                  {SOURCE_LABELS[it.source]}
                </span>
                <span className="flex-1">{it.title}</span>
              </a>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[10px] mono text-[var(--muted)] pl-[42px]">
                <span style={{ color: NICHE_COLOR[it.niche] }}>
                  {NICHE_LABELS[it.niche]}
                </span>
                {host && <span>{host}</span>}
                {(it.points > 0 || it.num_comments > 0) && (
                  <>
                    <span>·</span>
                    {it.points > 0 && <span>{it.points}↑</span>}
                    {it.num_comments > 0 && (
                      <a
                        href={it.comments_url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-[var(--accent)]"
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
    </div>
  );
}
