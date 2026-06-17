/**
 * Cliente de actividad de GitHub.
 *
 * Usa la Search API de GitHub para traer commits y PRs del usuario en una
 * ventana de días, normalizados a {@link RawActivity} para cachear en DB y
 * alimentar el feed y el resumen diario.
 */
import { Octokit } from 'octokit';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const USER = process.env.GITHUB_USERNAME!;

/** Actividad normalizada (un commit o un PR) lista para cachear. */
export interface RawActivity {
  day: string;
  repo: string;
  kind: 'commit' | 'pr';
  title: string;
  url: string | null;
  sha: string | null;
}

/**
 * Trae commits y PRs del usuario en una ventana de N días usando la Search API.
 * Devuelve actividad normalizada lista para cachear en Supabase.
 */
export async function fetchActivity(days = 1): Promise<RawActivity[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const out: RawActivity[] = [];

  // Commits autored por el usuario.
  const commits = await octokit.rest.search.commits({
    q: `author:${USER} author-date:>=${since}`,
    sort: 'author-date',
    order: 'desc',
    per_page: 100,
  });
  for (const c of commits.data.items) {
    out.push({
      day: (c.commit.author?.date ?? '').slice(0, 10),
      repo: c.repository.full_name,
      kind: 'commit',
      title: c.commit.message.split('\n')[0],
      url: c.html_url,
      sha: c.sha,
    });
  }

  // PRs creados por el usuario.
  const prs = await octokit.rest.search.issuesAndPullRequests({
    q: `author:${USER} type:pr created:>=${since}`,
    sort: 'created',
    order: 'desc',
    per_page: 100,
  });
  for (const p of prs.data.items) {
    out.push({
      day: p.created_at.slice(0, 10),
      repo: p.repository_url.split('/repos/')[1] ?? '',
      kind: 'pr',
      title: p.title,
      url: p.html_url,
      sha: String(p.id),
    });
  }

  return out;
}
