// Универсальный пагинационный хук.
// fetcher принимает (from, to) — индексы для Supabase .range(from, to) (включительно).
// pageSize по умолчанию 20. Первая страница грузится автоматически.
//
// Использование:
//   const { items, loading, loadingMore, hasMore, loadMore, refresh } = usePagination<Booking>(
//     async (from, to) => {
//       const q = supabase.from('bookings').select('*').order('start_time', { ascending: false }).range(from, to);
//       return await loadBookings(q);
//     },
//   );

import { useCallback, useEffect, useRef, useState } from 'react';

export interface PaginationResult<T> {
  items: T[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function usePagination<T>(
  fetcher: (from: number, to: number) => Promise<T[]>,
  pageSize: number = 20,
): PaginationResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);

  // Текущий offset (== items.length после успешной загрузки). Через ref,
  // чтобы быстрые повторные клики «Загрузить ещё» не сбивали from.
  const fromRef = useRef<number>(0);
  // Защита от гонок: если refresh() вызвался во время loadMore — отбрасываем устаревший ответ.
  const reqIdRef = useRef<number>(0);
  // Сам fetcher держим в ref, чтобы не пересоздавать useEffect при каждом ре-рендере родителя.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    const myReq = ++reqIdRef.current;
    fromRef.current = 0;
    setLoading(true);
    setHasMore(true);
    try {
      const data = await fetcherRef.current(0, pageSize - 1);
      if (myReq !== reqIdRef.current) return;
      setItems(data);
      fromRef.current = data.length;
      setHasMore(data.length === pageSize);
    } catch (e) {
      if (myReq !== reqIdRef.current) return;
      console.warn('[usePagination] refresh error', e);
      setItems([]);
      setHasMore(false);
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  }, [pageSize]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore) return;
    const myReq = reqIdRef.current;
    const from = fromRef.current;
    const to = from + pageSize - 1;
    setLoadingMore(true);
    try {
      const data = await fetcherRef.current(from, to);
      if (myReq !== reqIdRef.current) return; // refresh пришёл — игнорим
      setItems((prev) => [...prev, ...data]);
      fromRef.current = from + data.length;
      setHasMore(data.length === pageSize);
    } catch (e) {
      if (myReq !== reqIdRef.current) return;
      console.warn('[usePagination] loadMore error', e);
      setHasMore(false);
    } finally {
      if (myReq === reqIdRef.current) setLoadingMore(false);
    }
  }, [loading, loadingMore, hasMore, pageSize]);

  useEffect(() => {
    refresh();
    // refresh стабилен по pageSize — этого достаточно для первичной загрузки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { items, loading, loadingMore, hasMore, loadMore, refresh };
}
