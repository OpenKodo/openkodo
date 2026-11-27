import * as z from 'zod'

export const tabContentTypeSchema = z.enum([
  'terminal',
  'editor',
  'diff',
  'conflict-review',
  'check-details',
  'git-graph',
  'agent-session',
  'browser',
  'room'
])

export const workspaceVisibleTabTypeSchema = z.enum([
  'terminal',
  'editor',
  'agent-session',
  'browser'
])
