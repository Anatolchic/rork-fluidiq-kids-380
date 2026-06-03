import { useState, useCallback, useMemo } from 'react';

/**
 * Универсальный хук selection mode для списков (массовые операции в админке).
 * getId — стабильный extractor id (тот же, что в keyExtractor у FlatList).
 */
export function useSelection<T>(getId: (item: T) => string) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback(
    (item: T) => {
      setSelected(prev => {
        const s = new Set(prev);
        const id = getId(item);
        if (s.has(id)) s.delete(id);
        else s.add(id);
        return s;
      });
    },
    [getId],
  );

  const clear = useCallback(() => setSelected(new Set()), []);

  const selectAll = useCallback(
    (items: T[]) => setSelected(new Set(items.map(getId))),
    [getId],
  );

  const has = useCallback((id: string) => selected.has(id), [selected]);

  return {
    selected,
    ids: useMemo(() => Array.from(selected), [selected]),
    toggle,
    clear,
    selectAll,
    has,
    count: selected.size,
  };
}
