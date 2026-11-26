// Why import-free: the community directory's indexer can vendor this file verbatim, so
// validate:plugin, install and the indexer reserve exactly the same names.

/** Publishers only OpenKodo's official catalog may use, plus every name starting with `openkodo`. */
export const RESERVED_PLUGIN_PUBLISHERS: readonly string[] = [
  'official',
  'anthropic',
  'openai',
  'github'
]
export const RESERVED_PLUGIN_PUBLISHER_PREFIX = 'openkodo'

export function isReservedPluginPublisher(publisher: string): boolean {
  const name = publisher.toLowerCase()
  return (
    name.startsWith(RESERVED_PLUGIN_PUBLISHER_PREFIX) || RESERVED_PLUGIN_PUBLISHERS.includes(name)
  )
}
