// Sample plugin runs in a lazily forked plain-Node worker; its default export receives commands, events and capability-gated host API.
export default function activate(openkodo) {
  openkodo.commands.register('hello-ping', async () => {
    const stored = await openkodo.host.call('storage.get', { key: 'pings' })
    const count = (typeof stored?.value === 'number' ? stored.value : 0) + 1
    await openkodo.host.call('storage.set', { key: 'pings', value: count })
    // A string result is shown as-is in OpenKodo; objects are shown as JSON.
    return count === 1 ? 'Pong! First ping.' : `Pong! ${count} pings so far.`
  })

  openkodo.events.on('workspace.created', async (payload) => {
    openkodo.log(`${payload.kind} created: ${payload.workspaceId} at ${payload.path}`)
    await openkodo.host.call('notifications.show', {
      title: 'Workspace created',
      body: payload.path
    })
  })

  openkodo.events.on('agent.status.changed', (payload) => {
    openkodo.log(`agent status: ${payload.state} in ${payload.workspaceId ?? 'unknown workspace'}`)
  })
}
