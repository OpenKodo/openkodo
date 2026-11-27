import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'

export type CopyOpenKodoIdMenuItemCopy = {
  label: string
  tooltip: string
  copied: string
  failed: string
}

// Module level: React Compiler can't lower try/catch/finally inside a component.
async function copyOpenKodoId(
  resolveOpenKodoSessionId: () => Promise<string | null>,
  copy: CopyOpenKodoIdMenuItemCopy,
  onSettled: (() => void) | undefined
): Promise<void> {
  try {
    const openkodoSessionId = await resolveOpenKodoSessionId()
    if (openkodoSessionId) {
      await window.api.ui.writeClipboardText(openkodoSessionId)
      toast.success(copy.copied)
    } else {
      toast.error(copy.failed)
    }
  } catch {
    toast.error(copy.failed)
  } finally {
    onSettled?.()
  }
}

/** Copies an OpenKodo id the host resolves at click, `openkodo_session_id:<id>`; null resolves as a failure. */
export function CopyOpenKodoIdMenuItem({
  resolveOpenKodoSessionId,
  copy,
  onSettled
}: {
  resolveOpenKodoSessionId: () => Promise<string | null>
  copy: CopyOpenKodoIdMenuItemCopy
  onSettled?: () => void
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuItem
          onSelect={() => void copyOpenKodoId(resolveOpenKodoSessionId, copy, onSettled)}
        >
          <Copy />
          {copy.label}
        </DropdownMenuItem>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="max-w-[220px]">
        {copy.tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

/** Copies the chat's OpenKodo session ID from the host: `openkodo_session_id:<root>`, which `/clear` keeps. */
export function NativeChatCopyOpenKodoSessionIdMenuItem({
  resolveOpenKodoSessionId
}: {
  resolveOpenKodoSessionId: () => Promise<string | null>
}): React.JSX.Element {
  const t = useTranslate()
  return (
    <CopyOpenKodoIdMenuItem
      resolveOpenKodoSessionId={resolveOpenKodoSessionId}
      copy={{
        label: t(
          'components.native-chat.contextMenu.copyOpenKodoSessionId',
          'Copy OpenKodo Session ID'
        ),
        tooltip: t(
          'components.native-chat.contextMenu.openkodoSessionIdTooltip',
          "OpenKodo's ID for this chat, separate from the agent CLI's own session ID. Agents use it to refer to each other through OpenKodo."
        ),
        copied: t(
          'components.native-chat.contextMenu.openkodoSessionIdCopied',
          'OpenKodo session ID copied'
        ),
        failed: t(
          'components.native-chat.contextMenu.openkodoSessionIdCopyFailed',
          'Unable to copy OpenKodo session ID'
        )
      }}
    />
  )
}
