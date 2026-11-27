/** JSX element factory for the guest `openkodo` module. Elements are plain data until rendered. */

export const OPENKODO_ELEMENT = Symbol.for('openkodo.declarative.element')
export const Fragment = Symbol.for('openkodo.declarative.fragment')

export type OpenKodoProps = Record<string, unknown>
/** Loosely typed on purpose: author-facing prop types live in the published `openkodo` typings. */
export type OpenKodoComponent = (props: OpenKodoProps) => unknown
export type OpenKodoElementType = string | typeof Fragment | OpenKodoComponent

export type OpenKodoElement = {
  readonly $$typeof: typeof OPENKODO_ELEMENT
  readonly type: OpenKodoElementType
  readonly props: OpenKodoProps
  readonly key: string | undefined
}

export function isOpenKodoElement(value: unknown): value is OpenKodoElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$$typeof' in value &&
    value.$$typeof === OPENKODO_ELEMENT
  )
}

function createElement(
  type: OpenKodoElementType,
  props: OpenKodoProps,
  key: unknown
): OpenKodoElement {
  return Object.freeze({
    $$typeof: OPENKODO_ELEMENT,
    type,
    props,
    key: key === undefined || key === null ? undefined : String(key)
  })
}

/** Automatic runtime (`jsx`/`jsxs`/`jsxDEV`): children arrive inside `props`. */
export function jsx(
  type: OpenKodoElementType,
  props: OpenKodoProps | null,
  key?: unknown
): OpenKodoElement {
  const { key: propKey, ...rest } = props ?? {}
  return createElement(type, rest, key ?? propKey)
}

/** Classic runtime (`h`, `jsxFactory`): children arrive as trailing arguments. */
export function h(
  type: OpenKodoElementType,
  props: OpenKodoProps | null,
  ...children: unknown[]
): OpenKodoElement {
  const { key, ...rest } = props ?? {}
  if (children.length > 0) {
    rest.children = children.length === 1 ? children[0] : children
  }
  return createElement(type, rest, key)
}
