let listener: (environmentId: string) => void | Promise<void> = () => {}

export function setManagedOpenkododPairingRepairedListener(
  next: (environmentId: string) => void | Promise<void>
): void {
  listener = next
}

export function notifyManagedOpenkododPairingRepaired(environmentId: string): void | Promise<void> {
  return listener(environmentId)
}
