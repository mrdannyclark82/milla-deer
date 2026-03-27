import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Switch, Route, Redirect } from 'wouter';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useTheme } from './hooks/useTheme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function AuthGate() {
  const { data, isLoading } = useQuery<{ authenticated: boolean }>({
    queryKey: ['auth-status'],
    queryFn: async () => {
      const res = await fetch('/api/auth/status');
      if (!res.ok) return { authenticated: false };
      return res.json() as Promise<{ authenticated: boolean }>;
    },
    staleTime: 60_000,
  });

  if (isLoading) return null;

  const isAuthenticated = data?.authenticated ?? false;

  return (
    <Switch>
      <Route path="/">
        {isAuthenticated ? <Redirect to="/chat" /> : <Landing />}
      </Route>
      <Route path="/chat">
        <Dashboard />
      </Route>
      <Route>
        <Dashboard />
      </Route>
    </Switch>
  );
}

function App() {
  useTheme(); // applies saved theme on mount, keeps document class in sync
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <AuthGate />
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

export default App;
