import { openKodoHomePath } from '../../../shared/home/openkodo-home'
import { credentialFileExists } from '../../credentials/credential-file-io'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export const LEGACY_WORKSPACE_ID = 'legacy'

function getOpenKodoDir(): string {
  return openKodoHomePath()
}

function getLegacyTokenPath(): string {
  return join(getOpenKodoDir(), 'linear-token.enc')
}

export function getLegacyViewerPath(): string {
  return join(getOpenKodoDir(), 'linear-viewer.json')
}

export function getWorkspaceFilePath(): string {
  return join(getOpenKodoDir(), 'linear-workspaces.json')
}

export function getWorkspaceTokenDir(): string {
  return join(getOpenKodoDir(), 'linear-tokens')
}

export function getWorkspaceTokenPath(workspaceId: string): string {
  if (workspaceId === LEGACY_WORKSPACE_ID) {
    return getLegacyTokenPath()
  }
  return join(getWorkspaceTokenDir(), `${Buffer.from(workspaceId).toString('base64url')}.enc`)
}

// The login Connect Linear hands this Mac, next to the workspace's API key.
export function getWorkspaceLoginPath(workspaceId: string): string {
  return join(getWorkspaceTokenDir(), `${Buffer.from(workspaceId).toString('base64url')}.login.enc`)
}

export async function ensureOpenKodoDir(): Promise<void> {
  const dir = getOpenKodoDir()
  if (!(await credentialFileExists(dir))) {
    await mkdir(dir, { recursive: true })
  }
}

export async function ensureWorkspaceTokenDir(): Promise<void> {
  const dir = getWorkspaceTokenDir()
  if (!(await credentialFileExists(dir))) {
    await mkdir(dir, { recursive: true })
  }
}
