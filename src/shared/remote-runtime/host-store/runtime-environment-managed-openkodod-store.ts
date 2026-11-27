import type * as core from './runtime-environment-managed-openkodod-operations'
import { submitEnvironmentStoreCommand } from './runtime-environment-store-worker-client'

export async function addManagedOpenkododEnvironment(
  ...args: Parameters<typeof core.addManagedOpenkododEnvironment>
): Promise<ReturnType<typeof core.addManagedOpenkododEnvironment>> {
  const reply = await submitEnvironmentStoreCommand({
    operation: 'addManagedOpenkododEnvironment',
    args
  })
  if (reply.operation !== 'addManagedOpenkododEnvironment') {
    throw new Error('Unexpected environment store response')
  }
  return reply.value
}

export async function removeManagedOpenkododEnvironment(
  ...args: Parameters<typeof core.removeManagedOpenkododEnvironment>
): Promise<ReturnType<typeof core.removeManagedOpenkododEnvironment>> {
  const reply = await submitEnvironmentStoreCommand({
    operation: 'removeManagedOpenkododEnvironment',
    args
  })
  if (reply.operation !== 'removeManagedOpenkododEnvironment') {
    throw new Error('Unexpected environment store response')
  }
  return reply.value
}

export async function refreshManagedOpenkododPairing(
  ...args: Parameters<typeof core.refreshManagedOpenkododPairing>
): Promise<ReturnType<typeof core.refreshManagedOpenkododPairing>> {
  const reply = await submitEnvironmentStoreCommand({
    operation: 'refreshManagedOpenkododPairing',
    args
  })
  if (reply.operation !== 'refreshManagedOpenkododPairing') {
    throw new Error('Unexpected environment store response')
  }
  return reply.value
}

export async function moveManagedOpenkododLocalPort(
  ...args: Parameters<typeof core.moveManagedOpenkododLocalPort>
): Promise<ReturnType<typeof core.moveManagedOpenkododLocalPort>> {
  const reply = await submitEnvironmentStoreCommand({
    operation: 'moveManagedOpenkododLocalPort',
    args
  })
  if (reply.operation !== 'moveManagedOpenkododLocalPort') {
    throw new Error('Unexpected environment store response')
  }
  return reply.value
}

export async function recordManagedOpenkododMigration(
  ...args: Parameters<typeof core.recordManagedOpenkododMigration>
): Promise<ReturnType<typeof core.recordManagedOpenkododMigration>> {
  const reply = await submitEnvironmentStoreCommand({
    operation: 'recordManagedOpenkododMigration',
    args
  })
  if (reply.operation !== 'recordManagedOpenkododMigration') {
    throw new Error('Unexpected environment store response')
  }
  return reply.value
}
