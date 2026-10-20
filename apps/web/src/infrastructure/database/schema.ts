import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const workspaces = pgTable('workspaces', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspace_slug: text('workspace_slug').notNull().unique(),
  workspace_name: text('workspace_name').notNull(),
  subscription_tier: text('subscription_tier').notNull().default('growth'),
  monthly_token_quota: integer('monthly_token_quota').notNull().default(1000000),
  monthly_tokens_consumed: integer('monthly_tokens_consumed').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspace_id: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  email: text('email').notNull().unique(),
  full_name: text('full_name').notNull(),
  role: text('role').notNull().default('member'),
  avatar_url: text('avatar_url'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agent_configs = pgTable('agent_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspace_id: uuid('workspace_id').references(() => workspaces.id, {
    onDelete: 'cascade',
  }),
  agent_slug: text('agent_slug').notNull().unique(),
  display_name: text('display_name').notNull(),
  role_title: text('role_title').notNull(),
  category: text('category').notNull(),
  status: text('status').notNull().default('online'),
  short_description: text('short_description').notNull(),
  capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),
  model_name: text('model_name').notNull().default('sineva-core-v2'),
  avg_latency_ms: integer('avg_latency_ms').notNull().default(420),
  active_sessions_count: integer('active_sessions_count').notNull().default(0),
  daily_tokens_used: integer('daily_tokens_used').notNull().default(0),
  accent_token: text('accent_token').notNull().default('--teal-500'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const chat_sessions = pgTable('chat_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspace_id: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  agent_slug: text('agent_slug').notNull(),
  session_title: text('session_title').notNull(),
  is_archived: boolean('is_archived').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const chat_messages = pgTable('chat_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  session_id: uuid('session_id')
    .notNull()
    .references(() => chat_sessions.id, { onDelete: 'cascade' }),
  agent_slug: text('agent_slug').notNull(),
  sender_role: text('sender_role').notNull(),
  message_text: text('message_text').notNull(),
  reasoning_summary: text('reasoning_summary'),
  suggested_actions: jsonb('suggested_actions').$type<string[]>().notNull().default([]),
  tokens_used: integer('tokens_used').notNull().default(0),
  latency_ms: integer('latency_ms').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const storage_objects = pgTable('storage_objects', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspace_id: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  object_key: text('object_key').notNull().unique(),
  bucket_name: text('bucket_name').notNull(),
  file_name: text('file_name').notNull(),
  content_type: text('content_type').notNull(),
  file_size_bytes: integer('file_size_bytes').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
