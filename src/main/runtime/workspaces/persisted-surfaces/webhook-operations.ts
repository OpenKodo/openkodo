import type { RuntimeAutomationController } from '../../integrations/automations/runtime-automation-controller'
import type { WebhookHostService } from '../../../webhooks/webhook-host-service'
import { OpenKodoRuntimeWithOrchestrationDatabaseBinding } from './orchestration-database-binding'
import { openkodoSignInServer } from '../../../bots/openkodo-sign-in-server'

export abstract class OpenKodoRuntimeWithWebhookOperations extends OpenKodoRuntimeWithOrchestrationDatabaseBinding {
  private webhooks: WebhookHostService | null = null
  /** A serve or openkodod host (session-window-graph.ts), whose signed-out copy names it. */
  abstract servesWithoutWindow: () => boolean

  /** This host's webhooks; null in `openkodo serve` and in builds without cloud auth. */
  getWebhooks(): WebhookHostService | null {
    return this.webhooks
  }

  setWebhooks(webhooks: WebhookHostService | null): void {
    this.webhooks = webhooks
    this.automation.webhooks.set(webhooks)
    // A headless server's signed-out save refusal names it and how it signs in.
    this.automation.webhooks.signInServer = () => openkodoSignInServer(this)
  }

  /** A connector event for a bot automation; null once the automation no longer takes it. */
  runAutomationForEvent(...args: Parameters<RuntimeAutomationController['runForEvent']>) {
    return this.automation.withExternalProbePriority(() => this.automation.runForEvent(...args))
  }
}
