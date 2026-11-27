import { basename } from 'node:path'
import { RuntimeClientError } from '../../runtime/connection/types'

export function resolveCompatibilityCliCommand(): 'openkodo' | 'openkodo-dev' {
  const configured = process.env.OPENKODO_CLI_COMMAND
  if (configured === 'openkodo' || configured === 'openkodo-dev') {
    return configured
  }
  return 'openkodo'
}

export function resolvePackagedWindowsCompatibilityCommand(): 'openkodo' | undefined {
  if (process.env.OPENKODO_WINDOWS_PACKAGED_CLI_LAUNCHER !== '1') {
    return undefined
  }
  const command = process.env.OPENKODO_CLI_COMMAND
  if (command === 'openkodo') {
    return command
  }
  throw new RuntimeClientError(
    'invalid_argument',
    'The packaged OpenKodo launcher did not provide a valid resume command. No question was created.'
  )
}

export async function flushOrchestrationStdout(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    process.stdout.write('', (error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

export function isDevCliInvocation(): boolean {
  return (
    process.env.OPENKODO_DEV_CLI_INVOCATION === '1' ||
    (process.env.OPENKODO_USER_DATA_PATH?.includes('openkodo-dev') ?? false)
  )
}

// Every platform installs `openkodo`; OpenKodo terminals advertise their shim via
// OPENKODO_CLI_COMMAND, dev launchers are `openkodo-dev`, and SSH/headless Node CLIs stay `openkodo`.
export function resolveInvokedCliCommand(): string {
  const configured = process.env.OPENKODO_CLI_COMMAND?.trim()
  if (configured) {
    return basename(configured)
  }
  if (isDevCliInvocation()) {
    return 'openkodo-dev'
  }
  return 'openkodo'
}
