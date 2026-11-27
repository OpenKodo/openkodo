import { createRoot, type Root } from 'react-dom/client'

type RendererRootHotData = {
  openkodoRendererRoot?: Root
}

export function getOrCreateRendererRoot(
  container: HTMLElement,
  hotData?: RendererRootHotData
): Root {
  const existingRoot = hotData?.openkodoRendererRoot
  if (existingRoot) {
    return existingRoot
  }
  const root = createRoot(container)
  if (hotData) {
    hotData.openkodoRendererRoot = root
  }
  return root
}
