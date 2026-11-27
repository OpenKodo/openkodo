// Shared-home hosts need per-machine state and runtime GC: a PID can prove ownership only on the machine that issued it (#29059).
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { RELAY_REMOTE_DIR } from '../install/remote-install-root'
import {
  machineKeyOf,
  namedMachineHome,
  OPENKODOD_MACHINE_NAME_PROBE,
  parseOpenkododMachineNameProbe
} from './openkodod-machine-name-home'
import { OPENKODOD_ACTIVATION_FILENAME } from '../activation/openkodod-activation-record'
import { parseDarwinPlatformUuid } from '../../persistence/profile-state/access/profile-state-access-identity'
import {
  joinRemotePath,
  normalizeRemoteHome,
  validateRemoteHome,
  type RemoteHostPlatform
} from '../../ssh/remote-host/ssh-remote-platform'

export const OPENKODOD_MACHINE_CLAIM_FILENAME = 'openkodod-machine.json'
export const OPENKODOD_MACHINE_HOMES_DIRNAME = 'hosts'
export const OPENKODOD_MACHINE_CLAIM_SCHEMA_VERSION = 1

const SECTION = '__OPENKODO_MACHINE_HOME_SECTION__'
const CLAIM_ABSENT = 'ABSENT'
const CLAIM_PRESENT = 'PRESENT'
const RECORD_MAX_BYTES = 4096
const ACCESS_ROOT = '.openkodo/.profile-state-access'
const INSTALLED = 'INSTALLED'
// Unknown filesystem types may be shared; recognize only proven local disk types.
const LOCAL_FILESYSTEM_TYPES = new Set([
  'ext2/ext3',
  'ext4',
  'xfs',
  'btrfs',
  'zfs',
  'bcachefs',
  'f2fs',
  'jfs',
  'reiserfs',
  'nilfs',
  'tmpfs',
  'ramfs',
  'overlayfs',
  'ecryptfs',
  'msdos',
  'vfat',
  'exfat',
  'hfsplus'
])

type OpenkododMachineIdentity = {
  /** Path-safe hash; raw machine identity is not persisted in the claim. */
  key: string
  /** Match the identity recorded by profile-state owners. */
  machineIdentity: string
  hostname: string | null
}

type OpenkododMachineClaimRead =
  | { state: 'absent' }
  | { state: 'present'; machineKey: string }
  | { state: 'unreadable'; reason: string }

export type OpenkododMachineHomeProbe = {
  loginHome: string
  identity: OpenkododMachineIdentity | null
  claim: OpenkododMachineClaimRead
  /** Include live and crashed owners when attributing shared-home state. */
  dataRootOwners: readonly {
    host: string | null
    machineIdentity: string | null
  }[]
  machineHomeKeys: readonly string[]
  loginHomeInstalled: boolean
  /** Local disks cannot belong to another machine's live server. */
  homeOnLocalDisk: boolean
  /** Raw OPENKODO_MACHINE_NAME; invalid names refuse rather than fall back silently. */
  machineName: string | null
}

export type OpenkododMachineHomeDecision =
  | { kind: 'login-home' }
  | { kind: 'claim'; machineKey: string }
  | { kind: 'machine-home'; machineKey: string }
  /** Shared pre-claim installs require attribution before takeover. */
  | { kind: 'unresolved'; machineKey: string; cause: OpenkododMachineOwnershipUnresolvedCause }

type OpenkododMachineOwnershipUnresolvedCause = 'stopped-install' | 'unattributed-owner'

/** Probe home ownership once, using the same machine identity sources as profile-state access. */
export function openkododMachineHomeProbeCommand(host: RemoteHostPlatform): string {
  const claim = `"$HOME"/${quotePosixShell(`${RELAY_REMOTE_DIR}/${OPENKODOD_MACHINE_CLAIM_FILENAME}`)}`
  const access = `"$HOME"/${quotePosixShell(ACCESS_ROOT)}`
  const homes = `"$HOME"/${quotePosixShell(`${RELAY_REMOTE_DIR}/${OPENKODOD_MACHINE_HOMES_DIRNAME}`)}`
  const activation = `"$HOME"/${quotePosixShell(`${RELAY_REMOTE_DIR}/${OPENKODOD_ACTIVATION_FILENAME}`)}`
  return [
    `printf '%s\\n' "$HOME"; echo ${SECTION};`,
    host.os === 'darwin'
      ? // Try PATH first for relocated host tools before the standard macOS location.
        '{ ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null ||' +
        ' /usr/sbin/ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null; } | grep IOPlatformUUID;'
      : 'cat /etc/machine-id 2>/dev/null;',
    `echo; echo ${SECTION}; uname -n 2>/dev/null; echo;`,
    `${OPENKODOD_MACHINE_NAME_PROBE} echo ${SECTION};`,
    // Full disks can leave an empty claim; publication can replace it.
    `if { [ ! -e ${claim} ] && [ ! -L ${claim} ]; } || { [ -f ${claim} ] && [ ! -s ${claim} ]; };`,
    `then echo ${CLAIM_ABSENT};`,
    `elif [ -f ${claim} ]; then echo ${CLAIM_PRESENT}; head -c ${RECORD_MAX_BYTES} ${claim}; echo;`,
    `else echo UNREADABLE; fi; echo ${SECTION};`,
    `for f in ${access}/participants/*/*.owner ${access}/maintenance/*.owner; do`,
    `[ -f "$f" ] && { head -c ${RECORD_MAX_BYTES} "$f"; echo; }; done; echo ${SECTION};`,
    `ls -1 ${homes} 2>/dev/null; echo ${SECTION};`,
    `[ -e ${activation} ] && echo ${INSTALLED}; echo ${SECTION};`,
    // BSD stat -f has different semantics; macOS uses df device source instead.
    host.os === 'darwin' ? '' : `stat -f -c %T "$HOME" 2>/dev/null; echo ${SECTION};`,
    `df -P "$HOME" 2>/dev/null | tail -n 1; true`
  ].join(' ')
}

export function parseOpenkododMachineHomeProbe(
  output: string,
  host: RemoteHostPlatform
): OpenkododMachineHomeProbe {
  const sections = output.split(new RegExp(`^${SECTION}$`, 'mu'))
  if (sections.length !== (host.os === 'darwin' ? 8 : 9)) {
    throw new Error('openkodod machine-home probe returned no verifiable answer')
  }
  const [homeRaw, machineRaw, hostnameRaw, claimRaw, ownersRaw, homesRaw, installedRaw] = sections
  const filesystemType = host.os === 'darwin' ? '' : sections[7].trim()
  const dfSource = sections.at(-1)?.trim().split(/\s+/u)[0] ?? ''
  const hostnameLines = hostnameRaw.split('\n').map((line) => line.trim())
  const loginHome = normalizeRemoteHome(homeRaw, host)
  if (!validateRemoteHome(loginHome, host)) {
    throw new Error(`Remote home is not a valid path: ${loginHome.slice(0, 100)}`)
  }
  return {
    loginHome,
    identity: openkododMachineIdentity(
      host,
      machineRaw.trim(),
      hostnameLines.find((line) => line && !line.startsWith('OPENKODO_')) ?? ''
    ),
    claim: parseClaimSection(claimRaw.trim()),
    dataRootOwners: ownersRaw
      .split('\n')
      .map((line) => parseOwnerLine(line.trim()))
      .filter((owner) => owner !== null),
    machineHomeKeys: homesRaw
      .split('\n')
      .map((name) => name.trim())
      .filter((name) => /^[a-f0-9]{16}$/u.test(name)),
    loginHomeInstalled: installedRaw.trim() === INSTALLED,
    // Without a filesystem type, only a device source proves local storage.
    homeOnLocalDisk: filesystemType
      ? LOCAL_FILESYSTEM_TYPES.has(filesystemType)
      : dfSource.startsWith('/dev/'),
    ...parseOpenkododMachineNameProbe(hostnameLines)
  }
}

/** Prefer stable Linux machine-id or macOS hardware UUID over hostnames; missing identity retains login-home fallback. */
export function openkododMachineIdentity(
  host: RemoteHostPlatform,
  machineRaw: string,
  hostnameRaw: string
): OpenkododMachineIdentity | null {
  const machineIdentity =
    host.os === 'darwin'
      ? parseDarwinPlatformUuid(machineRaw)
      : /^[a-f0-9]{32}$/u.test(machineRaw) && !/^0+$/u.test(machineRaw)
        ? machineRaw
        : null
  if (!machineIdentity) {
    return null
  }
  const key = machineKeyOf(`${host.os}:${machineIdentity}`)
  const hostname = /^[\x21-\x7e]{1,255}$/u.test(hostnameRaw) ? hostnameRaw : null
  return { key, machineIdentity, hostname }
}

function parseClaimSection(raw: string): OpenkododMachineClaimRead {
  if (raw === CLAIM_ABSENT) {
    return { state: 'absent' }
  }
  if (!raw.startsWith(CLAIM_PRESENT)) {
    return { state: 'unreadable', reason: 'the claim is not a regular file' }
  }
  return parseOpenkododMachineClaim(raw.slice(CLAIM_PRESENT.length).trim())
}

export function parseOpenkododMachineClaim(raw: string): OpenkododMachineClaimRead {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { state: 'unreadable', reason: 'the claim is not JSON' }
  }
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'schemaVersion' in parsed &&
    parsed.schemaVersion === OPENKODOD_MACHINE_CLAIM_SCHEMA_VERSION &&
    'machineKey' in parsed &&
    typeof parsed.machineKey === 'string' &&
    /^[a-f0-9]{16}$/u.test(parsed.machineKey)
  ) {
    return { state: 'present', machineKey: parsed.machineKey }
  }
  return { state: 'unreadable', reason: 'the claim has an unknown shape' }
}

function parseOwnerLine(line: string): OpenkododMachineHomeProbe['dataRootOwners'][number] | null {
  if (!line.startsWith('{')) {
    return null
  }
  try {
    const owner: unknown = JSON.parse(line)
    if (typeof owner !== 'object' || owner === null) {
      return null
    }
    return {
      host: 'host' in owner && typeof owner.host === 'string' ? owner.host : null,
      machineIdentity:
        'machineIdentity' in owner && typeof owner.machineIdentity === 'string'
          ? owner.machineIdentity
          : null
    }
  } catch {
    // Malformed owner records cannot prove a foreign machine owns the home.
    return null
  }
}

function ownerMachine(
  owner: OpenkododMachineHomeProbe['dataRootOwners'][number],
  identity: OpenkododMachineIdentity,
  host: RemoteHostPlatform
): 'this' | 'foreign' | 'unknown' {
  if (owner.machineIdentity) {
    return owner.machineIdentity.toLowerCase() === identity.machineIdentity ? 'this' : 'foreign'
  }
  // Older owners lack machine identity, leaving only weaker hostname evidence.
  if (!owner.host || !identity.hostname) {
    return 'unknown'
  }
  if (owner.host === identity.hostname) {
    return 'this'
  }
  // Network changes rename Macs, so differing hostnames cannot prove foreign ownership.
  return host.os === 'darwin' ? 'unknown' : 'foreign'
}

/** Keep established machine homes stable; refuse ambiguous prior owners or unreadable claims before risking another machine's state. */
export function decideOpenkododMachineHome(
  probe: OpenkododMachineHomeProbe,
  host: RemoteHostPlatform
): OpenkododMachineHomeDecision {
  const { identity, claim } = probe
  // An explicit name never shares state by machine identity, which clones copy.
  if (probe.machineName) {
    return namedMachineHome(host, probe.machineName)
  }
  if (!identity) {
    return { kind: 'login-home' }
  }
  if (claim.state === 'unreadable') {
    throw new Error(
      `openkodod cannot tell which machine owns ${RELAY_REMOTE_DIR}/${OPENKODOD_MACHINE_CLAIM_FILENAME}: ${claim.reason}`
    )
  }
  if (claim.state === 'present') {
    return claim.machineKey === identity.key
      ? { kind: 'login-home' }
      : { kind: 'machine-home', machineKey: identity.key }
  }
  const owners = probe.dataRootOwners.map((owner) => ownerMachine(owner, identity, host))
  if (probe.machineHomeKeys.includes(identity.key) || owners.includes('foreign')) {
    return { kind: 'machine-home', machineKey: identity.key }
  }
  if (probe.homeOnLocalDisk) {
    return { kind: 'claim', machineKey: identity.key }
  }
  // Unknown ownership could admit a second writer whose PIDs are judged on the wrong host.
  if (owners.includes('unknown')) {
    return { kind: 'unresolved', machineKey: identity.key, cause: 'unattributed-owner' }
  }
  return probe.loginHomeInstalled && owners.length === 0
    ? { kind: 'unresolved', machineKey: identity.key, cause: 'stopped-install' }
    : { kind: 'claim', machineKey: identity.key }
}

export function openkododMachineOwnershipUnresolvedMessage(
  machineKey: string,
  hostname: string | null,
  cause: OpenkododMachineOwnershipUnresolvedCause = 'stopped-install'
): string {
  const claim = JSON.stringify({
    schemaVersion: OPENKODOD_MACHINE_CLAIM_SCHEMA_VERSION,
    machineKey
  })
  const path = `~/${RELAY_REMOTE_DIR}/${OPENKODOD_MACHINE_CLAIM_FILENAME}`
  const why =
    cause === 'stopped-install'
      ? 'that stopped server left no record of its own'
      : 'the older OpenKodo server there recorded only a hostname, which does not identify its machine'
  return (
    `OpenKodo can't tell which machine set up the OpenKodo server in ~/${RELAY_REMOTE_DIR}: ` +
    `this home may be shared by several machines, and ${why}. ` +
    'If another machine set it up, connect to that one and run the command shown there. ' +
    `If ${hostname ?? 'this machine'} set it up, run this on it, then reconnect: ` +
    `mkdir -p ~/${RELAY_REMOTE_DIR} && printf '%s' '${claim}' > ${path}`
  )
}

export function openkododMachineHomeDir(
  host: RemoteHostPlatform,
  loginHome: string,
  machineKey: string
): string {
  return joinRemotePath(
    host,
    loginHome,
    RELAY_REMOTE_DIR,
    OPENKODOD_MACHINE_HOMES_DIRNAME,
    machineKey
  )
}

/** Keep data roots shallow beside ~/.openkodo so long shared-home paths fit Unix socket limits. */
export function openkododMachineDataRoot(
  host: RemoteHostPlatform,
  loginHome: string,
  machineKey: string
): string {
  return joinRemotePath(host, loginHome, `.openkodo-${machineKey.slice(0, 8)}`)
}
