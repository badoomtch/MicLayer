import { Sidebar } from './shell/Sidebar';
import { TopBar } from './shell/TopBar';
import { Footer } from './shell/Footer';
import { Dashboard } from './features/dashboard/Dashboard';
import { Tune } from './features/tune/Tune';
import { Profiles } from './features/profiles/Profiles';
import { Settings } from './features/settings/Settings';
import { useAppStore } from './state/useAppStore';
import { useEngineBridge } from './state/useEngineBridge';
import { useProfilesBridge } from './state/useProfilesBridge';
import { FirstRunModal } from './features/onboarding/FirstRunModal';

export function App() {
  useEngineBridge();
  useProfilesBridge();
  const section = useAppStore((s) => s.ui.section);

  return (
    <div className="flex h-screen flex-col">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          {section === 'dashboard' && <Dashboard />}
          {section === 'tune' && <Tune />}
          {section === 'profiles' && <Profiles />}
          {section === 'settings' && <Settings />}
        </main>
      </div>
      <Footer />
      <FirstRunModal />
    </div>
  );
}
