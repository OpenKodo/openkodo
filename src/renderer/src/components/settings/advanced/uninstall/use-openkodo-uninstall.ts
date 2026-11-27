import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type {
  OpenKodoUninstallFinishAction,
  OpenKodoUninstallPlan,
  OpenKodoUninstallRunStepArgs,
  OpenKodoUninstallStep
} from '../../../../../../shared/uninstall/openkodo-uninstall-types'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import {
  markOpenKodoUninstallStepFailed,
  mergeOpenKodoUninstallStepResult,
  runOpenKodoUninstallSteps,
  shouldRemoveHookScriptsAfterAgentRetry
} from './openkodo-uninstall-plan-state'

export type OpenKodoUninstallPhase = 'idle' | 'running' | 'done'

export type OpenKodoUninstallModel = {
  plan: OpenKodoUninstallPlan | null
  loadFailed: boolean
  phase: OpenKodoUninstallPhase
  runningStep: OpenKodoUninstallStep | null
  /** `step` or `step:id` keys with a retry in flight. */
  retrying: ReadonlySet<string>
  start: () => void
  retry: (args: OpenKodoUninstallRunStepArgs) => void
  reload: () => void
  finish: (action: OpenKodoUninstallFinishAction) => void
}

export function openkodoUninstallRetryKey(step: OpenKodoUninstallStep, id?: string): string {
  return id ? `${step}:${id}` : step
}

const failureDetail = (): string =>
  translate('settings.uninstall.stepFailed', 'OpenKodo could not finish this step.')

/** Loads the plan on mount (the collapsed summary names every part) and drives the step runner. */
export function useOpenKodoUninstall(): OpenKodoUninstallModel {
  const mountedRef = useMountedRef()
  const [plan, setPlan] = useState<OpenKodoUninstallPlan | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [phase, setPhase] = useState<OpenKodoUninstallPhase>('idle')
  const [runningStep, setRunningStep] = useState<OpenKodoUninstallStep | null>(null)
  const [retrying, setRetrying] = useState<ReadonlySet<string>>(() => new Set())
  const planRef = useRef<OpenKodoUninstallPlan | null>(null)

  const applyPlan = useCallback((next: OpenKodoUninstallPlan): void => {
    planRef.current = next
    setPlan(next)
  }, [])

  const reload = useCallback((): void => {
    setLoadFailed(false)
    window.api.openkodoUninstall.getPlan().then(
      (next) => {
        if (mountedRef.current) {
          applyPlan(next)
        }
      },
      (error) => {
        console.error('[uninstall] failed to read the uninstall plan:', error)
        if (mountedRef.current) {
          setLoadFailed(true)
        }
      }
    )
  }, [applyPlan, mountedRef])

  useEffect(() => {
    reload()
  }, [reload])

  const start = useCallback((): void => {
    const initial = planRef.current
    if (!initial || phase !== 'idle') {
      return
    }
    setPhase('running')
    void runOpenKodoUninstallSteps(
      initial,
      (args) => window.api.openkodoUninstall.runStep(args),
      failureDetail(),
      (next, step) => {
        if (mountedRef.current) {
          applyPlan(next)
          setRunningStep(step)
        }
      }
    ).then(() => {
      if (mountedRef.current) {
        setPhase('done')
      }
    })
  }, [applyPlan, mountedRef, phase])

  const retry = useCallback(
    (args: OpenKodoUninstallRunStepArgs): void => {
      const run = (stepArgs: OpenKodoUninstallRunStepArgs): void => {
        const keys = stepArgs.only?.map((id) => openkodoUninstallRetryKey(stepArgs.step, id)) ?? [
          openkodoUninstallRetryKey(stepArgs.step)
        ]
        setRetrying((prev) => new Set([...prev, ...keys]))
        const fold = (update: (current: OpenKodoUninstallPlan) => OpenKodoUninstallPlan): void => {
          if (mountedRef.current && planRef.current) {
            // Into the latest plan, since retries can finish out of order.
            applyPlan(update(planRef.current))
          }
        }
        window.api.openkodoUninstall
          .runStep(stepArgs)
          .then(
            (next) => {
              fold((current) => mergeOpenKodoUninstallStepResult(current, next, stepArgs))
              // The run kept the scripts for the agent that failed; now nothing uses them.
              if (
                stepArgs.step === 'agent-hooks' &&
                mountedRef.current &&
                planRef.current &&
                shouldRemoveHookScriptsAfterAgentRetry(planRef.current)
              ) {
                run({ step: 'hook-scripts' })
              }
            },
            (error) => {
              console.error(`[uninstall] retry of ${stepArgs.step} failed:`, error)
              fold((current) => markOpenKodoUninstallStepFailed(current, stepArgs, failureDetail()))
            }
          )
          .finally(() => {
            if (mountedRef.current) {
              setRetrying((prev) => new Set([...prev].filter((key) => !keys.includes(key))))
            }
          })
      }
      run(args)
    },
    [applyPlan, mountedRef]
  )

  const finish = useCallback((action: OpenKodoUninstallFinishAction): void => {
    window.api.openkodoUninstall.finish(action).catch((error) => {
      console.error(`[uninstall] finish(${action}) failed:`, error)
      toast.error(translate('settings.uninstall.finishFailed', 'OpenKodo could not do that.'))
    })
  }, [])

  return { plan, loadFailed, phase, runningStep, retrying, start, retry, reload, finish }
}
