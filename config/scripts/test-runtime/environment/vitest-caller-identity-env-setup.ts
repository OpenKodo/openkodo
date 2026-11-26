// Clear the launching terminal’s inherited Orca identity so test branches depend on fixture env, not which agent launched runner.
// Clear the launching terminal's identity too: macOS /etc/zshrc and /etc/bashrc source /etc/{zsh,bash}rc_$TERM_PROGRAM.
for (const name of [
  'OPENKODO_AGENT_SESSION_ID',
  'OPENKODO_STRUCTURED_SESSION',
  'OPENKODO_WORKTREE_ID',
  'OPENKODO_WORKSPACE_ID',
  'OPENKODO_RUNTIME_SOURCE_ID',
  'OPENKODO_RUNTIME_SOURCE_INCARNATION',
  'OPENKODO_RUNTIME_SOURCE_PROFILE_PATH',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'TERM_SESSION_ID'
]) {
  delete process.env[name]
}
