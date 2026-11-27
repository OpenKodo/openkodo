/** The first line of an error, for one short row detail. */
export function openkodoUninstallErrorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split('\n')[0]
}
