// OpenKodo components panel catalog: the components `openkodo` exports and their props. Part of the `openkodo`
// module with openkodo.d.ts, openkodo-components-layout.d.ts and openkodo-components-data.d.ts; checked by
// plugin-declarative-typings.test.ts.

declare module 'openkodo' {
  import type { OpenKodoComponent, OpenKodoNode } from 'openkodo'

  export type Gap = 'none' | 'xs' | 'sm' | 'md' | 'lg'
  export type Align = 'start' | 'center' | 'end' | 'stretch'
  /** The one colour vocabulary every component shares. */
  export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
  export type Size = 'xs' | 'sm' | 'md'
  export type Variant = 'solid' | 'outline' | 'ghost'
  export type Press = () => unknown
  /** The same names as a manifest panel's `icon`; any other name shows a fallback glyph. */
  export type IconName =
    | 'activity'
    | 'bar-chart-3'
    | 'bell'
    | 'blocks'
    | 'book'
    | 'bot'
    | 'bug'
    | 'calendar'
    | 'cloud'
    | 'code'
    | 'database'
    | 'file-text'
    | 'flag'
    | 'folder'
    | 'gauge'
    | 'globe'
    | 'hammer'
    | 'layers'
    | 'lightbulb'
    | 'package'
    | 'plug'
    | 'puzzle'
    | 'rocket'
    | 'star'
    | 'terminal'
    | 'wrench'
    | 'zap'
    | 'add'
    | 'remove'
    | 'delete'
    | 'edit'
    | 'refresh'
    | 'search'
    | 'settings'
    | 'check'
    | 'close'
    | 'info'
    | 'warning'
    | 'error'
    | 'open-external'
    | 'copy'
    | 'download'
    | 'upload'
    | 'play'
    | 'pause'
    | 'stop'
    | 'more'
    | 'expand'
    | 'collapse'
    | 'next'
    | 'filter'
    | 'branch'
    | 'file'
    | 'agent'
    | 'link'

  export type WithChildren = { children?: OpenKodoNode }
  export type Leaf = { children?: never }
  /** A fixed-height scroll area, so long content does not push the rest of the panel away. */
  export type MaxHeight = 'sm' | 'md' | 'lg' | 'none'

  /** Unset `align`: fields, tables and cards fill the width, buttons keep their own; `stretch`
   *  stretches buttons too. */
  export type StackProps = WithChildren & { gap?: Gap; align?: Align }
  export type RowProps = WithChildren & {
    gap?: Gap
    align?: Align
    justify?: 'start' | 'center' | 'end' | 'between'
    wrap?: boolean
  }
  export type TextProps = WithChildren & {
    tone?: Tone
    muted?: boolean
    size?: Size
    weight?: 'regular' | 'medium' | 'semibold'
    truncate?: boolean
  }
  export type HeadingProps = WithChildren & { level?: 1 | 2 | 3 }
  export type ButtonProps = WithChildren & {
    variant?: Variant
    tone?: Tone
    size?: Size
    icon?: IconName
    /** Since 1.4.247: shown on hover and focus. */
    tooltip?: string
    disabled?: boolean
    onPress?: Press
  }
  export type IconButtonProps = Leaf & {
    icon: IconName
    /** Accessible name, and the tooltip unless `tooltip` is given. */
    label: string
    /** Since 1.4.247. */
    tooltip?: string
    variant?: Variant
    tone?: Tone
    size?: Size
    disabled?: boolean
    onPress?: Press
  }
  export type BadgeProps = WithChildren & { tone?: Tone }
  export type CardProps = WithChildren & { title?: string; description?: string }
  export type ListProps = WithChildren & { label?: string }
  /** With `onPress` the whole row is the press target, so it cannot contain other controls. */
  export type ListItemProps = WithChildren & {
    title?: string
    description?: string
    icon?: IconName
    current?: boolean
    disabled?: boolean
    onPress?: Press
  }
  /**
   * OpenKodo keeps the text as the person types. `defaultValue` seeds it; a changed `value` replaces
   * it (an echo of what was typed does not). `value` without `onChange` is read-only.
   */
  export type InputProps = Leaf & {
    label: string
    labelHidden?: boolean
    value?: string
    defaultValue?: string
    placeholder?: string
    type?: 'text' | 'search' | 'password'
    maxLength?: number
    invalid?: boolean
    disabled?: boolean
    onChange?: (value: string) => void
    onSubmit?: (value: string) => void
  }
  export type SwitchProps = Leaf & {
    label: string
    checked?: boolean
    defaultChecked?: boolean
    disabled?: boolean
    onChange?: (checked: boolean) => void
  }
  export type SelectProps = Leaf & {
    label: string
    labelHidden?: boolean
    value?: string
    defaultValue?: string
    placeholder?: string
    options: readonly { value: string; label: string; disabled?: boolean }[]
    disabled?: boolean
    onChange?: (value: string) => void
  }
  export type SeparatorProps = Leaf & { orientation?: 'horizontal' | 'vertical' }
  export type ProgressProps = Leaf & { label: string; labelHidden?: boolean; value?: number }
  export type SpinnerProps = Leaf & { label: string; labelHidden?: boolean }
  export type EmptyStateProps = WithChildren & {
    title: string
    description?: string
    icon?: IconName
  }
  export type LinkProps = WithChildren & { href?: string; onPress?: Press }
  export type CodeProps = WithChildren & { block?: boolean }

  // Catalog 2, since OpenKodo 1.4.247: check `ui.has()` when your minimum OpenKodo is older.
  export type TextareaProps = Leaf & {
    label: string
    labelHidden?: boolean
    value?: string
    defaultValue?: string
    placeholder?: string
    /** Visible lines, 2 to 20. */
    rows?: number
    maxLength?: number
    invalid?: boolean
    disabled?: boolean
    onChange?: (value: string) => void
    /** Cmd+Enter (Ctrl+Enter off macOS). */
    onSubmit?: (value: string) => void
  }
  export type CheckboxProps = Leaf & {
    label: string
    description?: string
    checked?: boolean
    defaultChecked?: boolean
    disabled?: boolean
    onChange?: (checked: boolean) => void
  }
  export type RadioOption = {
    value: string
    label: string
    description?: string
    disabled?: boolean
  }
  export type RadioGroupProps = Leaf & {
    label: string
    labelHidden?: boolean
    value?: string
    defaultValue?: string
    options: readonly RadioOption[]
    orientation?: 'vertical' | 'horizontal'
    disabled?: boolean
    onChange?: (value: string) => void
  }
  export type SliderProps = Leaf & {
    label: string
    labelHidden?: boolean
    value?: number
    defaultValue?: number
    /** Defaults 0, 100 and 1. */
    min?: number
    max?: number
    step?: number
    showValue?: boolean
    disabled?: boolean
    onChange?: (value: number) => void
  }
  /** A label, description and error around any controls. */
  export type FieldProps = WithChildren & {
    label: string
    description?: string
    error?: string
    required?: boolean
  }
  export const Stack: OpenKodoComponent<StackProps>
  export const Row: OpenKodoComponent<RowProps>
  export const Text: OpenKodoComponent<TextProps>
  export const Heading: OpenKodoComponent<HeadingProps>
  export const Button: OpenKodoComponent<ButtonProps>
  export const IconButton: OpenKodoComponent<IconButtonProps>
  export const Badge: OpenKodoComponent<BadgeProps>
  export const Card: OpenKodoComponent<CardProps>
  export const List: OpenKodoComponent<ListProps>
  export const ListItem: OpenKodoComponent<ListItemProps>
  export const Input: OpenKodoComponent<InputProps>
  export const Switch: OpenKodoComponent<SwitchProps>
  export const Select: OpenKodoComponent<SelectProps>
  export const Separator: OpenKodoComponent<SeparatorProps>
  export const Progress: OpenKodoComponent<ProgressProps>
  export const Spinner: OpenKodoComponent<SpinnerProps>
  export const EmptyState: OpenKodoComponent<EmptyStateProps>
  export const Link: OpenKodoComponent<LinkProps>
  export const Code: OpenKodoComponent<CodeProps>
  export const Textarea: OpenKodoComponent<TextareaProps>
  export const Checkbox: OpenKodoComponent<CheckboxProps>
  export const RadioGroup: OpenKodoComponent<RadioGroupProps>
  export const Slider: OpenKodoComponent<SliderProps>
  export const Field: OpenKodoComponent<FieldProps>

  export type ComponentName =
    | 'Stack'
    | 'Row'
    | 'Text'
    | 'Heading'
    | 'Button'
    | 'IconButton'
    | 'Badge'
    | 'Card'
    | 'List'
    | 'ListItem'
    | 'Input'
    | 'Switch'
    | 'Select'
    | 'Separator'
    | 'Progress'
    | 'Spinner'
    | 'EmptyState'
    | 'Link'
    | 'Code'
    | 'Textarea'
    | 'Checkbox'
    | 'RadioGroup'
    | 'Slider'
    | 'Field'
    | 'Tabs'
    | 'Tab'
    | 'Collapsible'
    | 'Toolbar'
    | 'Grid'
    | 'Table'
    | 'Tree'
    | 'Markdown'
    | 'CodeView'
    | 'Image'
    | 'KeyValue'
    | 'Callout'
    | 'Skeleton'
    | 'RelativeTime'
    | 'Box'
}
