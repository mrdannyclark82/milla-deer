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
  const { data, isLoading } = useQuery({
    queryKey: ['auth-status'],
    queryFn: async (): Promise<{ authenticated: boolean }> => {
      const res = await fetch('/api/auth/status');
      if (!res.ok) return { authenticated: false };
      return res.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) return null;

  const isAuthenticated = data?.authenticated ?? false;

  const handleLoginSuccess = () => {
    // Hard redirect — forces full page reload so auth state is fresh from server
    window.location.replace('/chat');
  };

  return (
    <Switch>
      <Route path="/">
        {isAuthenticated ? <Redirect to="/chat" /> : <Landing onLoginSuccess={handleLoginSuccess} />}
      </Route>
      <Route path="/login">
        {isAuthenticated ? <Redirect to="/chat" /> : <Landing onLoginSuccess={handleLoginSuccess} loginMode />}
      </Route>
      <Route path="/chat">
        {isAuthenticated ? <Dashboard /> : <Redirect to="/" />}
      </Route>
      <Route>
        {isAuthenticated ? <Dashboard /> : <Redirect to="/" />}
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
