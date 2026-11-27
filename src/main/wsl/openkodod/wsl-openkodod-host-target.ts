/** kind distinguishes WSL from SSH targets; id/distro match the deployment record and label names the environment. */
export type WslOpenkododHostTarget = {
  kind: 'wsl'
  id: string
  distro: string
  label: string
}
