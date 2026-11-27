import '../memory/host-malloc-tunables-claim'
import '../ipc/pty/host-env/inherited-openkodo-identity-claim'
import process from 'node:process'
import { main } from './serve-startup/openkodod-command-startup'
import { resolveOpenkododExitCode } from './serve-startup/openkodod-exit-code'
import { reserveServeStdoutForReadiness } from '../server/serve-stdout-boundary'
import { runOpenkododNativePreflightVerdict } from './native-runtime/openkodod-native-preflight'
import {
  OPENKODOD_PROFILE_PREFLIGHT_FLAG,
  OPENKODOD_STARTUP_PREFLIGHT_FLAG
} from '../../shared/remote-runtime/openkodod-distribution/openkodod-profile-preflight'
import { onNodePtyLoadFailure } from '../providers/pty/node-pty-load-failure'
import {
  confirmBundledOpenkododStartupQualified,
  discardBundledOpenkododStartupQualification,
  forgetBundledOpenkododStartupQualification,
  preflightBundledOpenkododStartup,
  runOpenkododProfilePreflight
} from './runtime-launch/openkodod-profile-preflight'
import { assertOpenkododServerRuntime } from './runtime-launch/openkodod-bundled-runtime'
import {
  formatOpenkododNativePreflightReport,
  OPENKODOD_NATIVE_PREFLIGHT_FLAG
} from '../../shared/remote-runtime/openkodod-distribution/openkodod-native-preflight-report'
import {
  OPENKODOD_CANCEL_MANAGED_STOP_FLAG,
  OPENKODOD_COMPLETE_MANAGED_STOP_FLAG
} from '../../shared/remote-runtime/openkodod-lifecycle/openkodod-stop-request'
import {
  OPENKODOD_WINDOWS_BREAKAWAY_CONTRACT,
  WINDOWS_BREAKAWAY_LAUNCH_FLAG
} from '../../shared/remote-runtime/openkodod-lifecycle/windows-breakaway-launch'
import { runWindowsBreakawayLaunchIfRequested } from './runtime-launch/windows-breakaway-launcher'
import { parseArgs } from './serve-startup/openkodod-command-arguments'
import { OPENKODOD_RECLAIM_STALE_LOCK_FLAG } from '../../shared/remote-runtime/openkodod-lifecycle/openkodod-stale-lock-reclaim'
import { installFatalSignalListenerGuard } from '../crash-reporting/fatal-signal-listener-guard'

// A fatal V8 trap must crash, never spin on a JS fault-signal listener.
installFatalSignalListenerGuard()

function failStartup(error: unknown): void {
  console.error('openkodod: failed to start:', error)
  // Distinguish configuration refusals so supervisors cannot restart-spin on them.
  process.exit(resolveOpenkododExitCode(error))
}

// A resolved plain-Node module graph proves the build guard; skip probes, ports and data-root locks.
if (process.argv.includes('--openkodod-smoke-load-check')) {
  // Activation loads lazily at startup; load it here so the guard still covers its graph.
  void import('../backend/core-runtime-activation').then(() => process.exit(0), failStartup)
} else if (process.argv[2] === '--openkodod-structured-provider-load-check') {
  // One-shot launch and stop commands must skip server startup and preflights.
  void import('./native-runtime/openkodod-structured-provider-smoke')
    .then(({ smokeLoadOpenkododStructuredProviders }) => smokeLoadOpenkododStructuredProviders())
    .then(() => process.exit(0))
    .catch(failStartup)
} else if (process.argv[2] === WINDOWS_BREAKAWAY_LAUNCH_FLAG) {
  runWindowsBreakawayLaunchIfRequested(OPENKODOD_WINDOWS_BREAKAWAY_CONTRACT, process.argv)
} else if (
  process.argv[2] === OPENKODOD_COMPLETE_MANAGED_STOP_FLAG ||
  process.argv[2] === OPENKODOD_CANCEL_MANAGED_STOP_FLAG
) {
  void import('./host-lifecycle/managed-stop/openkodod-managed-stop-command').then(
    ({ runOpenkododManagedStopCommandAndExit }) =>
      runOpenkododManagedStopCommandAndExit(process.argv.slice(2))
  )
} else if (process.argv[2] === OPENKODOD_RECLAIM_STALE_LOCK_FLAG) {
  void import('./instance-lock/openkodod-stale-lock-reclaim').then(
    ({ runOpenkododStaleLockReclaimCommandAndExit }) =>
      runOpenkododStaleLockReclaimCommandAndExit(process.argv.slice(2))
  )
} else {
  startOpenkododProcess()
}

function startOpenkododProcess(): void {
  try {
    const argv = process.argv.slice(2)
    if ((argv.includes('--help') || argv.includes('-h')) && parseArgs(argv).help) {
      void main(argv).catch(failStartup)
      return
    }
    assertOpenkododServerRuntime()
    const flag = process.argv[2]
    if (flag === OPENKODOD_NATIVE_PREFLIGHT_FLAG && process.argv.length === 3) {
      void import('./native-runtime/node-pty-precondition').then(({ checkNodePtyPrecondition }) => {
        const verdict = checkNodePtyPrecondition()
        const report = formatOpenkododNativePreflightReport(verdict.status, verdict.reason ?? null)
        process.stdout.write(`${report}\n`, () => process.exit(0))
      }, failStartup)
    } else if (
      (flag === OPENKODOD_STARTUP_PREFLIGHT_FLAG && process.argv.length === 4) ||
      (flag === OPENKODOD_PROFILE_PREFLIGHT_FLAG &&
        (process.argv.length === 4 || process.argv.length === 5))
    ) {
      void runOpenkododProfilePreflight(process.argv[3], {
        nativeFeatures: flag === OPENKODOD_PROFILE_PREFLIGHT_FLAG,
        servedUserDataPath: process.argv[4]
      })
        // The owner reads EOF; lingering native handles must not keep this probe alive.
        .then(() => process.stdout.write('', () => process.exit(0)))
        .catch(failStartup)
    } else {
      // Stdout is the readiness API; send incidental diagnostics to stderr.
      reserveServeStdoutForReadiness()
      void preflightBundledOpenkododStartup()
        .then((qualified) => {
          onNodePtyLoadFailure(() => void discardBundledOpenkododStartupQualification())
          // Probe before deferred node-pty loading can crash this process; a slot qualified on this
          // unchanged host passed it on its last launch.
          if (runOpenkododNativePreflightVerdict({ qualified }) !== 'ok') {
            forgetBundledOpenkododStartupQualification()
          }
          return main()
        })
        .then(confirmBundledOpenkododStartupQualified)
        .catch(failStartup)
    }
  } catch (error) {
    failStartup(error)
  }
}
