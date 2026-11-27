import { defineMethod, defineStreamingMethod, type RpcContext } from '../core'
import { rpcCallerOperationKey } from '../callers/rpc-caller-identity'
import {
  getOpenKodoServerSignIn,
  type OpenKodoServerSignIn
} from '../../../openkodo-profiles/openkodo-server-sign-in'
import {
  OpenKodoAccountSelectOrgParams,
  OpenKodoAccountSignInCompleteParams,
  OpenKodoAccountSignInFlowParams,
  OpenKodoAccountSignInStartParams,
  OpenKodoAccountSignInWaitParams,
  OpenKodoAccountUnsubscribeParams
} from '../../../../shared/rpc-contract/openkodo-account-params'

// Per-process counter: same-millisecond subscriptions must not evict each other's cleanup.
let subscriptionSeq = 0

function server(): OpenKodoServerSignIn {
  const installed = getOpenKodoServerSignIn()
  if (!installed) {
    throw new Error('Signing in to OpenKodo is not available on this host. Update OpenKodo on it.')
  }
  return installed
}

function flowOwner({ caller }: Pick<RpcContext, 'caller'>): string {
  if (!caller) {
    throw new Error('This client cannot sign this host in.')
  }
  return rpcCallerOperationKey(caller)
}

// `workspace`: anyone who can run commands here could run the sign-in in a terminal anyway.
export const OPENKODO_ACCOUNT_METHODS = [
  defineMethod({
    name: 'openkodoAccount.status',
    permission: 'workspace',
    params: null,
    handler: async () => server().status()
  }),
  defineMethod({
    name: 'openkodoAccount.signIn.start',
    permission: 'workspace',
    params: OpenKodoAccountSignInStartParams,
    handler: async ({ switchAccount, approveInBrowser }, ctx) =>
      server().startSignIn(flowOwner(ctx), switchAccount ? 'switch-account' : 'sign-in', {
        approveInBrowser
      })
  }),
  defineMethod({
    name: 'openkodoAccount.signIn.wait',
    permission: 'workspace',
    params: OpenKodoAccountSignInWaitParams,
    handler: async ({ flowId, afterRevision }, ctx) =>
      server().waitSignIn(flowOwner(ctx), flowId, afterRevision, ctx.signal)
  }),
  defineMethod({
    name: 'openkodoAccount.signIn.complete',
    permission: 'workspace',
    params: OpenKodoAccountSignInCompleteParams,
    handler: async ({ flowId, code, state, redirectUri }, ctx) =>
      server().completeSignIn(flowOwner(ctx), flowId, { code, state, redirectUri })
  }),
  defineMethod({
    name: 'openkodoAccount.signIn.cancel',
    permission: 'workspace',
    params: OpenKodoAccountSignInFlowParams,
    handler: async ({ flowId }, ctx) => server().cancelSignIn(flowOwner(ctx), flowId)
  }),
  defineMethod({
    name: 'openkodoAccount.selectOrg',
    permission: 'workspace',
    params: OpenKodoAccountSelectOrgParams,
    handler: async ({ orgId }) => server().selectOrg(orgId)
  }),
  defineMethod({
    name: 'openkodoAccount.signOut',
    permission: 'workspace',
    params: null,
    handler: async () => server().signOut()
  }),
  defineStreamingMethod({
    name: 'openkodoAccount.subscribe',
    permission: 'workspace',
    params: null,
    handler: async (_params, { runtime, connectionId }, emit) => {
      const account = server()
      await new Promise<void>((resolve) => {
        const unsubscribe = account.onChanged((status) => emit({ type: 'status', status }))
        const subscriptionId = `openkodo-account-${connectionId ?? 'inproc'}-${++subscriptionSeq}`
        runtime.registerSubscriptionCleanup(
          subscriptionId,
          () => {
            unsubscribe()
            emit({ type: 'end' })
            resolve()
          },
          connectionId
        )
        emit({ type: 'ready', subscriptionId, status: account.status() })
      })
    }
  }),
  defineMethod({
    name: 'openkodoAccount.unsubscribe',
    permission: 'workspace',
    params: OpenKodoAccountUnsubscribeParams,
    handler: async ({ subscriptionId }, { runtime }) => {
      runtime.cleanupSubscription(subscriptionId)
      return { unsubscribed: true }
    }
  })
]
