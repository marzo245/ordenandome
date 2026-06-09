import { pgTable, uuid, text, date, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const tasks = pgTable(
  'tasks',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    title: text().notNull(),
    description: text(),
    status: text({ enum: ['todo', 'doing', 'done'] }).notNull().default('todo'),
    priority: text({ enum: ['baja', 'media', 'alta'] }).notNull().default('media'),
    due_date: date(),
    deadline: date(),
    tags: text().array().default(sql`'{}'`),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    completed_at: timestamp({ withTimezone: true }),
  },
  (t) => [index('idx_tasks_due').on(t.due_date)]
);

export const github_activity = pgTable(
  'github_activity',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    day: date().notNull(),
    repo: text().notNull(),
    kind: text({ enum: ['commit', 'pr'] }).notNull(),
    title: text().notNull(),
    url: text(),
    sha: text(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_activity_day').on(t.day),
    uniqueIndex('github_activity_kind_sha_repo_key').on(t.kind, t.sha, t.repo),
  ]
);

export const task_messages = pgTable(
  'task_messages',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    task_id: uuid().notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    role: text({ enum: ['user', 'assistant'] }).notNull(),
    content: text().notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_task_messages_task').on(t.task_id, t.created_at)]
);

export type TaskMessage = typeof task_messages.$inferSelect;

export const daily_summaries = pgTable('daily_summaries', {
  id: uuid().primaryKey().default(sql`gen_random_uuid()`),
  day: date().notNull().unique(),
  content: text().notNull(),
  generated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type GithubActivityRow = typeof github_activity.$inferSelect;
export type NewGithubActivity = typeof github_activity.$inferInsert;
export type DailySummary = typeof daily_summaries.$inferSelect;
