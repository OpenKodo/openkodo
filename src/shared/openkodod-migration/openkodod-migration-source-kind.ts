/** Legacy SSH omits source.kind to preserve signed bytes/digests. Other kinds must set kind and omit sshTargetId:
 * older destinations strip unknown fields, then fail parsing instead of importing a non-SSH source as SSH. */
import type {
  OpenkododMigrationLocalWslManifestSource,
  OpenkododMigrationManifestSource,
  OpenkododMigrationSshManifestSource
} from './openkodod-migration-manifest'
import { OPENKODOD_MIGRATION_LOCAL_WSL_SOURCE_RUNTIME_CAPABILITY } from '../remote-runtime/protocol/openkodod-runtime-capabilities'

export const OPENKODOD_MIGRATION_SSH_RELAY_SOURCE_KIND = 'ssh-relay' as const

/** Non-SSH kinds and the destination capability that proves a destination parses each one. */
export const OPENKODOD_MIGRATION_SOURCE_KIND_CAPABILITIES = {
  'local-wsl': OPENKODOD_MIGRATION_LOCAL_WSL_SOURCE_RUNTIME_CAPABILITY
} as const

export type OpenkododMigrationNonSshSourceKind =
  keyof typeof OPENKODOD_MIGRATION_SOURCE_KIND_CAPABILITIES
export type OpenkododMigrationSourceKind =
  | typeof OPENKODOD_MIGRATION_SSH_RELAY_SOURCE_KIND
  | OpenkododMigrationNonSshSourceKind

export const OPENKODOD_MIGRATION_SOURCE_KIND_UNKNOWN = 'openkodod_migration_source_kind_unknown'

/** A manifest source as it travels: this build may not know every field a newer peer signed. */
export type OpenkododMigrationWireSource = Readonly<Record<string, unknown>>

export function openkododMigrationManifestSourceKind(
  source: OpenkododMigrationWireSource
): OpenkododMigrationSourceKind {
  if (source.kind === undefined) {
    return OPENKODOD_MIGRATION_SSH_RELAY_SOURCE_KIND
  }
  // An explicit 'ssh-relay' is refused too: SSH has exactly one encoding, so one digest.
  if (isNonSshSourceKind(source.kind)) {
    return source.kind
  }
  throw new Error(OPENKODOD_MIGRATION_SOURCE_KIND_UNKNOWN)
}

function isNonSshSourceKind(kind: unknown): kind is OpenkododMigrationNonSshSourceKind {
  return (
    typeof kind === 'string' && Object.hasOwn(OPENKODOD_MIGRATION_SOURCE_KIND_CAPABILITIES, kind)
  )
}

/** The capability a destination must advertise before it may see this source; null for SSH. */
export function requiredOpenkododMigrationSourceCapability(
  source: OpenkododMigrationWireSource
): string | null {
  const kind = openkododMigrationManifestSourceKind(source)
  return kind === OPENKODOD_MIGRATION_SSH_RELAY_SOURCE_KIND
    ? null
    : OPENKODOD_MIGRATION_SOURCE_KIND_CAPABILITIES[kind]
}

export function isOpenkododMigrationLocalWslSource(
  source: OpenkododMigrationManifestSource
): source is OpenkododMigrationLocalWslManifestSource {
  return 'kind' in source && source.kind === 'local-wsl'
}

/** For the SSH conversion's own steps: a WSL manifest reaching them is a bug, never a fallback. */
export function requireOpenkododMigrationSshSource(
  source: OpenkododMigrationManifestSource
): OpenkododMigrationSshManifestSource {
  if (isOpenkododMigrationLocalWslSource(source)) {
    throw new Error('openkodod_migration_source_not_ssh')
  }
  return source
}
