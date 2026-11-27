import { describe, expect, it } from 'vitest'
import {
  parseOpenkododActivationTransaction,
  planOpenkododTransactionRecovery,
  serializeOpenkododActivationTransaction
} from '../activation/openkodod-activation-transaction'
import {
  committedOpenkododDecommissionRecord,
  createOpenkododDecommissionTransaction,
  withOpenkododDecommissionProcessExited,
  withOpenkododDecommissionStopDispatched
} from './openkodod-decommission-transaction'
import { FakeOpenkododHost, NEW } from '../activation/openkodod-activation-host-test-harness'
import type { OpenkododManagedStopRequest } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-stop-request'

const T = new Date('2026-02-02T00:00:00.000Z')
const ID = '7f1c2a7e-6c1b-4a8e-9f0e-0a1b2c3d4e5f'
const before = { ...FakeOpenkododHost.newRecord(), active: NEW }
const prepared = createOpenkododDecommissionTransaction({
  transactionId: ID,
  recordBefore: before,
  now: T
})
const request: OpenkododManagedStopRequest = {
  schemaVersion: 1,
  transactionId: ID,
  version: NEW,
  runtimeId: 'runtime-1',
  instance: {
    pid: 42,
    startedAtMs: 5,
    nonce: 'nonce',
    lockPath: '/home/u/.openkodo/openkodod.lock'
  },
  retireIdleDaemon: true
}
const dispatched = withOpenkododDecommissionStopDispatched(prepared, request, T)
const exited = withOpenkododDecommissionProcessExited(dispatched, T)

describe('the decommission journal entry', () => {
  it('journals a recordAfter released desktops still read, and commits the app version', () => {
    // Frozen validation from released desktops must continue accepting new stop journals.
    const releasedDefect = (journal: typeof prepared): string | null => {
      const b = journal.recordBefore
      const deactivated = {
        schemaVersion: 1,
        active: null,
        previous: b.active,
        activatedAt: null,
        snapshot: null
      }
      return `${JSON.stringify(journal.recordAfter, null, 2)}\n` ===
        `${JSON.stringify(deactivated, null, 2)}\n`
        ? null
        : 'recordAfter is not the deactivated recordBefore'
    }
    const versionedBefore = { ...before, activeAppVersion: '1.5.0', rolledBackFrom: '0.9.0+ff01' }
    const versioned = createOpenkododDecommissionTransaction({
      transactionId: ID,
      recordBefore: versionedBefore,
      now: T
    })
    const journal = JSON.parse(serializeOpenkododActivationTransaction(versioned))
    expect(releasedDefect(journal)).toBeNull()
    const interrupted = withOpenkododDecommissionProcessExited(
      withOpenkododDecommissionStopDispatched(versioned, request, T),
      T
    )
    const stored = parseOpenkododActivationTransaction(
      serializeOpenkododActivationTransaction(interrupted)
    )
    if (stored.state !== 'ok') {
      throw new Error('Expected the persisted decommission transaction to be readable')
    }
    expect(planOpenkododTransactionRecovery(stored.transaction, versionedBefore)).toMatchObject({
      action: 'confirm-decommissioned',
      record: { active: null, activeAppVersion: '1.5.0', rolledBackFrom: '0.9.0+ff01' }
    })
    expect(committedOpenkododDecommissionRecord(versioned)).toMatchObject({
      previous: NEW,
      activeAppVersion: '1.5.0'
    })
  })

  it.each([
    ['a dispatched phase without its request', { ...dispatched, request: null }],
    ['a request before dispatch', { ...prepared, request }],
    [
      'a request for another transaction',
      {
        ...dispatched,
        request: { ...request, transactionId: '5a7e1f0c-3b2d-4e6f-9a8b-7c6d5e4f3a2b' }
      }
    ],
    [
      'a request for another version',
      { ...dispatched, request: { ...request, version: '0.9.0+ff01' } }
    ],
    ['a recordAfter that still serves', { ...prepared, recordAfter: before }]
  ])('reads %s as unreadable, keeping the fence', (_name, transaction) => {
    expect(parseOpenkododActivationTransaction(JSON.stringify(transaction))).toMatchObject({
      state: 'unreadable'
    })
  })

  it('plans recovery from what the host is known to have done', () => {
    const after = prepared.recordAfter
    expect(planOpenkododTransactionRecovery(prepared, before)).toEqual({
      action: 'keep-serving',
      version: NEW
    })
    expect(planOpenkododTransactionRecovery(dispatched, before)).toEqual({
      action: 'resume-stop',
      request,
      record: after
    })
    expect(planOpenkododTransactionRecovery(exited, before)).toEqual({
      action: 'confirm-decommissioned',
      version: NEW,
      record: after
    })
    expect(planOpenkododTransactionRecovery(dispatched, after)).toEqual({
      action: 'confirm-decommissioned',
      version: NEW,
      record: null
    })
    expect(
      planOpenkododTransactionRecovery(dispatched, { ...after, previous: null })
    ).toMatchObject({
      action: 'refuse'
    })
  })
})
