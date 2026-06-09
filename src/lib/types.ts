export type TaskStatus = 'todo' | 'doing' | 'done';
export type TaskPriority = 'baja' | 'media' | 'alta';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  tags: string[] | null;
  created_at: string | Date;
  completed_at: string | Date | null;
}

export interface GitHubActivity {
  id: string;
  day: string;
  repo: string;
  kind: 'commit' | 'pr';
  title: string;
  url: string | null;
  sha: string | null;
}

export interface DailySummary {
  id: string;
  day: string;
  content: string;
  generated_at: string | Date;
}
