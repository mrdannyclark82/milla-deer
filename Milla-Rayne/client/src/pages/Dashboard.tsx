import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { SceneProvider } from '@/components/scene/SceneProvider';

export default function Dashboard() {
  return (
    <SceneProvider location="bedroom" appState="idle">
      <DashboardLayout />
    </SceneProvider>
  );
}
