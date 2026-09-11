import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";

const QUERY_CACHE_KEY = "hemmasian-query-cache";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 30 * 60_000,
      retry: 1,
      refetchOnMount: true,
      refetchOnReconnect: "always",
      refetchOnWindowFocus: "always",
    },
    mutations: {
      retry: 0,
    },
  },
});

const cachedState = sessionStorage.getItem(QUERY_CACHE_KEY);
if (cachedState) {
  try {
    hydrate(queryClient, JSON.parse(cachedState));
  } catch {
    sessionStorage.removeItem(QUERY_CACHE_KEY);
  }
}

let persistTimer: number | undefined;
queryClient.getQueryCache().subscribe(() => {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    sessionStorage.setItem(
      QUERY_CACHE_KEY,
      JSON.stringify(dehydrate(queryClient)),
    );
  }, 100);
});

export function clearQuerySession() {
  window.clearTimeout(persistTimer);
  queryClient.clear();
  sessionStorage.removeItem(QUERY_CACHE_KEY);
}
