import type { RuntimeNotifier } from './runtime-notifier-contract'
import { OpenKodoRuntimeWithPtyController } from '../../terminal/lifecycle/openkodo-runtime-pty-controller'

export abstract class RuntimeNotifierBinding extends OpenKodoRuntimeWithPtyController {
  setNotifier(notifier: RuntimeNotifier | null): void {
    this.notifier = notifier
    if (notifier) {
      this.repositoryForkBackfill.start()
    }
  }

  protected countTerminalSideEffectConsumingClientEventListeners(): number {
    return this.clientEvents.countTerminalSideEffectConsumers()
  }
}
