// Exit 0 means JSON was printed; read its outcome. Exit 64 is invalid input, 1 is failure without exit proof.
import {
  OPENKODOD_CANCEL_MANAGED_STOP_FLAG,
  OPENKODOD_COMPLETE_MANAGED_STOP_FLAG,
  OPENKODOD_MANAGED_STOP_REQUEST_FILE_FLAG,
  OpenkododManagedStopRequestSchema,
  type OpenkododManagedStopCancellation,
  type OpenkododManagedStopCompletion,
  type OpenkododManagedStopRequest
} from '../../../../shared/remote-runtime/openkodod-lifecycle/openkodod-stop-request'
import { cancelOpenkododManagedStop } from './openkodod-managed-stop-cancellation'
import { readOpenkododCompletedStopReceipt } from './openkodod-completed-stop-receipt'
import { readOpenkododManagedStopRequest } from './openkodod-managed-stop-request'
import { ZodError } from 'zod'
import {
  completeOpenkododManagedStop,
  type OpenkododManagedStopCompletionOptions
} from './openkodod-managed-stop-completion'

export async function runOpenkododManagedStopCommand(
  argv: readonly string[],
  options: OpenkododManagedStopCompletionOptions = {}
): Promise<OpenkododManagedStopCompletion> {
  const request = parseRequestArgument(argv, OPENKODOD_COMPLETE_MANAGED_STOP_FLAG)
  const verdict = await completeOpenkododManagedStop(request, options)
  const retirement =
    verdict === 'exited' && request.retireIdleDaemon
      ? readOpenkododCompletedStopReceipt(request)?.retirement
      : undefined
  const completion: OpenkododManagedStopCompletion = {
    ...request,
    kind: 'openkodod_managed_stop_completion',
    verdict,
    receiptPersisted: verdict === 'exited',
    ...(retirement ? { retirement } : {})
  }
  process.stdout.write(`${JSON.stringify(completion)}\n`)
  return completion
}

export function runOpenkododManagedStopCancelCommand(
  argv: readonly string[]
): OpenkododManagedStopCancellation {
  const request = parseRequestArgument(argv, OPENKODOD_CANCEL_MANAGED_STOP_FLAG)
  const cancellation: OpenkododManagedStopCancellation = {
    ...request,
    kind: 'openkodod_managed_stop_cancellation',
    outcome: cancelOpenkododManagedStop(request)
  }
  process.stdout.write(`${JSON.stringify(cancellation)}\n`)
  return cancellation
}

function parseRequestArgument(argv: readonly string[], flag: string): OpenkododManagedStopRequest {
  if (argv[0] !== flag) {
    throw new Error('openkodod_managed_stop_invalid_arguments')
  }
  if (argv[1] === OPENKODOD_MANAGED_STOP_REQUEST_FILE_FLAG) {
    if (argv.length !== 3 || !argv[2]) {
      throw new Error('openkodod_managed_stop_invalid_arguments')
    }
    return readOpenkododManagedStopRequest(argv[2])
  }
  if (argv.length !== 2 || !argv[1]) {
    throw new Error('openkodod_managed_stop_invalid_arguments')
  }
  return OpenkododManagedStopRequestSchema.parse(JSON.parse(argv[1]))
}

export const OPENKODOD_MANAGED_STOP_EXIT_VERDICT = 0
export const OPENKODOD_MANAGED_STOP_EXIT_FAILED = 1
export const OPENKODOD_MANAGED_STOP_EXIT_USAGE = 64

export async function runOpenkododManagedStopCommandAndExit(
  argv: readonly string[]
): Promise<void> {
  let code = OPENKODOD_MANAGED_STOP_EXIT_VERDICT
  try {
    if (argv[0] === OPENKODOD_CANCEL_MANAGED_STOP_FLAG) {
      runOpenkododManagedStopCancelCommand(argv)
    } else {
      await runOpenkododManagedStopCommand(argv)
    }
  } catch (error) {
    console.error('openkodod: managed stop failed:', error)
    code =
      error instanceof ZodError ||
      error instanceof SyntaxError ||
      (error instanceof Error && error.message === 'openkodod_managed_stop_invalid_arguments')
        ? OPENKODOD_MANAGED_STOP_EXIT_USAGE
        : OPENKODOD_MANAGED_STOP_EXIT_FAILED
  }
  // Drain stdout before exit: callers read the result to EOF.
  process.stdout.write('', () => process.exit(code))
}
