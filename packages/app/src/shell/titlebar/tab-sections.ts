export type TabGroup<T> = {
  readonly key: string
  readonly label: string
  readonly tabs: T[]
}

/**
 * Groups tabs by an arbitrary key while preserving first-appearance order of the
 * groups and the original relative order of tabs inside each group. Tabs are never
 * reordered inside a group: the sidebar only changes what is adjacent to what.
 */
export function groupTabs<T>(
  tabs: readonly T[],
  keyOf: (tab: T) => string,
  labelOf: (key: string) => string,
): TabGroup<T>[] {
  const groups: TabGroup<T>[] = []
  const byKey = new Map<string, TabGroup<T>>()

  for (const tab of tabs) {
    const key = keyOf(tab)
    let group = byKey.get(key)

    if (!group) {
      group = { key, label: labelOf(key), tabs: [] }
      byKey.set(key, group)
      groups.push(group)
    }

    group.tabs.push(tab)
  }

  return groups
}

/** Visual order of a grouped list, used for indices, numbering and keyboard travel. */
export function flattenGroups<T>(groups: readonly TabGroup<T>[]): T[] {
  return groups.flatMap((group) => group.tabs)
}

/** Last path segment, so a group header reads as the project folder name. */
export function directoryLabel(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}
