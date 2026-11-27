import { translate } from '@/i18n/i18n'
import type { Translate } from '@/i18n/use-translate'
import type { OpenKodoHookTrustKind as ScriptKind } from '../../../../../../shared/workspace-setup/hooks/openkodo-hook-trust-entries'

type SkippedSetupReviewCopy = {
  title: string
  description: string
  heading: string
}

/** Copy for a created workspace whose branch has different setup commands than the ones approved. */
export function getCreatedBranchCopy(t: Translate = translate): SkippedSetupReviewCopy {
  return {
    title: t(
      'worktree.setupTrust.branchDiffersTitle',
      "This workspace's branch has different setup commands"
    ),
    description: t(
      'worktree.setupTrust.branchDiffersBody',
      "The workspace was created, but its setup didn't run: its branch's <code>openkodo.yaml</code> differs from what you approved. Run these for this workspace only if you trust <repo/>."
    ),
    heading: t('worktree.setupTrust.branchSetupScript', "Branch's setup script")
  }
}

/** Copy for an automation whose run skipped setup because its branch's commands changed. */
export function getAutomationReviewCopy(t: Translate = translate): SkippedSetupReviewCopy {
  return {
    title: t(
      'automations.setupTrust.reviewTitle',
      'Approve the new setup commands for this automation?'
    ),
    description: t(
      'automations.setupTrust.reviewBody',
      "A run skipped setup because its branch's <code>openkodo.yaml</code> setup commands changed. Approving lets later runs use these commands. Only approve if you trust <repo/>."
    ),
    heading: t('worktree.setupTrust.branchSetupScript', "Branch's setup script")
  }
}

export function getTitle(
  kind: ScriptKind,
  repoName: string,
  previouslyApproved: boolean,
  t: Translate = translate
): string {
  const repo = { repo: repoName }
  if (previouslyApproved) {
    switch (kind) {
      case 'setup':
        return t(
          'auto.components.sidebar.OpenKodoYamlTrustDialog.setupChangedTitle',
          "{{repo}}'s setup script changed — run the new version?",
          repo
        )
      case 'archive':
        return t(
          'auto.components.sidebar.OpenKodoYamlTrustDialog.archiveChangedTitle',
          "{{repo}}'s archive script changed — run the new version?",
          repo
        )
      case 'issueCommand':
        return t(
          'auto.components.sidebar.OpenKodoYamlTrustDialog.issueCommandChangedTitle',
          "{{repo}}'s issue command changed — run the new version?",
          repo
        )
      case 'vmRecipe':
        return t(
          'auto.components.sidebar.OpenKodoYamlTrustDialog.vmRecipeChangedTitle',
          "{{repo}}'s VM recipe changed — run the new version?",
          repo
        )
    }
  }
  switch (kind) {
    case 'setup':
      return t(
        'auto.components.sidebar.OpenKodoYamlTrustDialog.setupRunTitle',
        'Run setup script from {{repo}}?',
        repo
      )
    case 'archive':
      return t(
        'auto.components.sidebar.OpenKodoYamlTrustDialog.archiveRunTitle',
        'Run archive script from {{repo}}?',
        repo
      )
    case 'issueCommand':
      return t(
        'auto.components.sidebar.OpenKodoYamlTrustDialog.issueCommandRunTitle',
        'Run issue command from {{repo}}?',
        repo
      )
    case 'vmRecipe':
      return t(
        'auto.components.sidebar.OpenKodoYamlTrustDialog.vmRecipeRunTitle',
        'Run VM recipe from {{repo}}?',
        repo
      )
  }
}

// Templates embed <code>openkodo.yaml</code> and a <repo/> slot filled by the component.
export function getDescription(
  kind: ScriptKind,
  previouslyApproved: boolean,
  t: Translate = translate
): string {
  if (previouslyApproved) {
    switch (kind) {
      case 'setup':
        return t(
          'auto.components.sidebar.OpenKodoYamlTrustDialog.setupChangedBody',
          '<code>openkodo.yaml</code> changed since you last approved. Re-review before it runs when this workspace is created.'
        )
      case 'archive':
        return t(
          'auto.components.sidebar.OpenKodoYamlTrustDialog.archiveChangedBody',
          '<code>openkodo.yaml</code> changed since you last approved. Re-review before it runs when this workspace is removed.'
        )
      case 'issueCommand':
        return t(
          'auto.components.sidebar.OpenKodoYamlTrustDialog.issueCommandChangedBody',
          '<code>openkodo.yaml</code> changed since you last approved. Re-review before it runs when this workspace launches with a linked issue.'
        )
      case 'vmRecipe':
        return t(
          'auto.components.sidebar.OpenKodoYamlTrustDialog.vmRecipeChangedBody',
          '<code>openkodo.yaml</code> changed since you last approved. Re-review before it runs before provisioning a VM.'
        )
    }
  }
  switch (kind) {
    case 'setup':
      return t(
        'auto.components.sidebar.OpenKodoYamlTrustDialog.setupRunBody',
        "This repository's <code>openkodo.yaml</code> runs on your machine when this workspace is created. Only run if you trust <repo/>."
      )
    case 'archive':
      return t(
        'auto.components.sidebar.OpenKodoYamlTrustDialog.archiveRunBody',
        "This repository's <code>openkodo.yaml</code> runs on your machine when this workspace is removed. Only run if you trust <repo/>."
      )
    case 'issueCommand':
      return t(
        'auto.components.sidebar.OpenKodoYamlTrustDialog.issueCommandRunBody',
        "This repository's <code>openkodo.yaml</code> runs on your machine when this workspace launches with a linked issue. Only run if you trust <repo/>."
      )
    case 'vmRecipe':
      return t(
        'auto.components.sidebar.OpenKodoYamlTrustDialog.vmRecipeRunBody',
        "This repository's <code>openkodo.yaml</code> runs on your machine before provisioning a VM. Only run if you trust <repo/>."
      )
  }
}

export function getScriptHeading(
  kind: ScriptKind,
  previouslyApproved: boolean,
  t: Translate = translate
): string {
  switch (kind) {
    case 'setup':
      return previouslyApproved
        ? t('auto.components.sidebar.OpenKodoYamlTrustDialog.newSetupScript', 'New setup script')
        : t('auto.components.sidebar.OpenKodoYamlTrustDialog.setupScript', 'Setup script')
    case 'archive':
      return previouslyApproved
        ? t(
            'auto.components.sidebar.OpenKodoYamlTrustDialog.newArchiveScript',
            'New archive script'
          )
        : t('auto.components.sidebar.OpenKodoYamlTrustDialog.archiveScript', 'Archive script')
    case 'issueCommand':
      return previouslyApproved
        ? t('auto.components.sidebar.OpenKodoYamlTrustDialog.newIssueCommand', 'New issue command')
        : t('auto.components.sidebar.OpenKodoYamlTrustDialog.issueCommand', 'Issue command')
    case 'vmRecipe':
      return previouslyApproved
        ? t('auto.components.sidebar.OpenKodoYamlTrustDialog.newVmRecipe', 'New VM recipe')
        : t('auto.components.sidebar.OpenKodoYamlTrustDialog.vmRecipe', 'VM recipe')
  }
}
