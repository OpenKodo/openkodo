/** Managed launches alone enable idle exit and name the activation fence that keeps updates/rollbacks alive.
 * Dependency-free so the openkodod launcher can read it. */
export const OPENKODOD_MANAGED_ACTIVATION_ROOT_ENV = 'OPENKODO_OPENKODOD_MANAGED_ACTIVATION_ROOT'

/** Host login env naming a machine's own managed-server data on a shared home; clones copy /etc/machine-id. */
export const OPENKODO_MACHINE_NAME_ENV = 'OPENKODO_MACHINE_NAME'
