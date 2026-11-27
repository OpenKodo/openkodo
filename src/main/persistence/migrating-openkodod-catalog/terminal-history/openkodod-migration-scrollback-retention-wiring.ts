import type { Store } from '../../loading-store/store'
import {
  listOpenkododMigrationSourceCutovers,
  setOpenkododMigrationJournalChangeListener
} from '../cutover-journals/openkodod-migration-cutover-journal'

export function installOpenkododMigrationScrollbackRetention(
  userDataPath: string,
  store: Pick<Store, 'syncOpenkododMigrationScrollbackRetention'>
): void {
  const sync = (path: string): void => {
    try {
      // Retain bytes until durable commit/abort; closed tabs must still upload on retry.
      const pending = listOpenkododMigrationSourceCutovers(path).filter(
        (cutover) => cutover.phase === 'source-fenced' || cutover.phase === 'destination-staged'
      )
      store.syncOpenkododMigrationScrollbackRetention(pending.map((cutover) => cutover.manifest))
    } catch (error) {
      // An unreadable journal keeps whatever is held; releasing on a guess could lose bytes.
      console.warn('[openkodod-migration] Could not sync scrollback retention:', error)
    }
  }
  setOpenkododMigrationJournalChangeListener(sync)
  sync(userDataPath)
}
