declare module '@tanstack/react-query' {
  import type { ReactNode } from 'react';

  export interface UseQueryOptions<TData> {
    queryKey: readonly unknown[];
    queryFn?: () => Promise<TData>;
    enabled?: boolean;
    refetchInterval?: number;
    staleTime?: number;
    gcTime?: number;
  }

  export interface UseQueryResult<TData> {
    data: TData | undefined;
    isLoading: boolean;
    isFetching: boolean;
    refetch: () => Promise<unknown>;
  }

  export function useQuery<TData>(
    options: UseQueryOptions<TData>
  ): UseQueryResult<TData>;

  export class QueryClient {
    constructor(options?: unknown);
  }

  export interface QueryClientProviderProps {
    client: QueryClient;
    children?: ReactNode;
  }

  export function QueryClientProvider(
    props: QueryClientProviderProps
  ): ReactNode;
}
