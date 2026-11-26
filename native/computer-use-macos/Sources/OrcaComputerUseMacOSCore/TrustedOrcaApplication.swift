/// Bundle ids of the apps whose computer-use sidecar may drive this helper.
public enum TrustedOrcaApplication {
    public static func isTrusted(bundleId: String) -> Bool {
        // Why: `pnpm dev` launches as `dev.openkodo.app.dev` and per-worktree wrapper apps use
        // `dev.openkodo.app.dev.<name>`; the sidecar peer check must authorize both.
        bundleId == "dev.openkodo.app" ||
            bundleId == "dev.openkodo.app.dev" ||
            bundleId.hasPrefix("dev.openkodo.app.dev.") ||
            bundleId == "com.github.Electron"
    }
}
