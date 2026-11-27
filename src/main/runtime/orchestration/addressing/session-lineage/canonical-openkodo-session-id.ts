import {
  isOpenKodoSessionId,
  type OpenKodoSessionId
} from '../../../../../shared/agent-session/identity/openkodo-session-address'
import {
  clearedInto,
  readAgentSessionRecordStore,
  type AgentSessionRecordReader
} from './structured-session-lineage'

/** Address by the /clear root to preserve Runs and mail; without records, retain the supplied id. */
export function canonicalOpenKodoSessionId(
  openkodoSessionId: OpenKodoSessionId,
  store: Pick<
    AgentSessionRecordReader,
    'listRecords' | 'lineageRevision'
  > | null = readAgentSessionRecordStore()
): OpenKodoSessionId {
  return createCanonicalOpenKodoSessionResolver(store)(openkodoSessionId)
}

/** A chat row's OpenKodo session ID: its conversation's /clear root, from one lineage index. */
export function createChatOpenKodoSessionIdResolver(
  store: Pick<
    AgentSessionRecordReader,
    'listRecords' | 'lineageRevision'
  > | null = readAgentSessionRecordStore()
): (sessionId: string) => string {
  const root = createCanonicalOpenKodoSessionResolver(store)
  return (sessionId) => (isOpenKodoSessionId(sessionId) ? root(sessionId) : sessionId)
}

/** Clear edges per lineage revision: mail checks ask per message, and must not rescan every record each time. */
const clearEdgesByRevision = new WeakMap<object, ReadonlyMap<string, string>>()

export function createCanonicalOpenKodoSessionResolver(
  store: Pick<AgentSessionRecordReader, 'listRecords' | 'lineageRevision'> | null
): (id: OpenKodoSessionId) => OpenKodoSessionId {
  if (!store) {
    return (id) => id
  }
  const revision = store.lineageRevision?.()
  let clearedFrom = revision ? clearEdgesByRevision.get(revision) : undefined
  if (!clearedFrom) {
    const edges = new Map<string, string>()
    for (const record of store.listRecords()) {
      const next = clearedInto(record)
      if (next) {
        edges.set(next, record.sessionId)
      }
    }
    clearedFrom = edges
    if (revision) {
      clearEdgesByRevision.set(revision, edges)
    }
  }
  const edges = clearedFrom
  return (id) => canonicalOpenKodoSessionFromEdges(id, edges)
}

export function canonicalOpenKodoSessionFromEdges(
  openkodoSessionId: OpenKodoSessionId,
  clearedFrom: ReadonlyMap<string, string>
): OpenKodoSessionId {
  // The visited set bounds corrupt chains; valid clear lineage is acyclic.
  let root: string = openkodoSessionId
  const earlier = new Set([root])
  let prior = clearedFrom.get(root)
  while (prior && !earlier.has(prior)) {
    earlier.add(prior)
    root = prior
    prior = clearedFrom.get(root)
  }
  // Record ids are minted as OpenKodo session ids; one that is not cannot name the conversation.
  return isOpenKodoSessionId(root) ? root : openkodoSessionId
}
