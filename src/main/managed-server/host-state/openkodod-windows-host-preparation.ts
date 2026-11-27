// Stage pinned Node and a content-addressed host script so Windows operations share verified bytes without replacing running clients' code.
import { join } from 'node:path'
import { getAppEnvironment } from '../../../shared/app-lifecycle/app-environment'
import type { NodeRuntimeTarget } from '../../../shared/node-runtime/node-runtime-pin'
import { ensureRemoteOpenkododNodeRuntime } from '../install/openkodod-remote-node-runtime'
import {
  installOpenkododWindowsHostScript,
  openkododRemoteBaseDir
} from '../install/openkodod-remote-windows-node'
import { materializeNodeRuntimeArchive } from '../../node-runtime/pinned-runtime-materializer'
import type { OpenkododHostTransport } from '../install/openkodod-host-transport'
import { joinRemotePath, type RemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'

export async function prepareWindowsOpenkododHost(options: {
  conn: OpenkododHostTransport
  host: RemoteHostPlatform
  remoteHome: string
  serverTarget: NodeRuntimeTarget
  signal?: AbortSignal
}): Promise<void> {
  const baseDir = openkododRemoteBaseDir(options.host, options.remoteHome)
  await ensureRemoteOpenkododNodeRuntime({
    conn: options.conn,
    host: options.host,
    // The runtime store is a sibling of slots; only this synthetic slot's parent is used.
    slotDir: joinRemotePath(options.host, baseDir, 'openkodod-host'),
    target: options.serverTarget,
    archivePath: () =>
      materializeNodeRuntimeArchive(
        options.serverTarget,
        join(getAppEnvironment().getPath('userData'), 'openkodod-artifacts'),
        { signal: options.signal }
      ),
    signal: options.signal
  })
  await installOpenkododWindowsHostScript(options, baseDir)
}
