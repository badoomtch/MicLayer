import { TitleBar } from './shell/TitleBar';
import { Sidebar } from './shell/Sidebar';
import { Dashboard } from './features/dashboard/Dashboard';
import { Tune } from './features/tune/Tune';
import { Profiles } from './features/profiles/Profiles';
import { Settings } from './features/settings/Settings';
import { useAppStore } from './state/useAppStore';
import { useEngineBridge } from './state/useEngineBridge';
import { useProfilesBridge } from './state/useProfilesBridge';
import { useProfileSync } from './state/useProfileSync';
import { useResolvedTheme } from './theme/ThemeProvider';
import { FirstRunModal } from './features/onboarding/FirstRunModal';

export function App() {
  useEngineBridge();
  useProfilesBridge();
  // Hoisted to App so slider changes from ANY page (Dashboard quick
  // controls, Tune module editors, the wizard) all debounce-push to
  // engine_apply_profile. Previously this hook only mounted on Tune,
  // which is why Dashboard sliders silently no-op'd.
  useProfileSync();
  const section = useAppStore((s) => s.ui.section);
  const theme = useResolvedTheme();

  return (
    <div className="ml-window" data-theme={theme}>
      <TitleBar />
      <div className="ml-body">
        <Sidebar />
        <main className="ml-content">
          {section === 'dashboard' && <Dashboard />}
          {section === 'tune' && <Tune />}
          {section === 'profiles' && <Profiles />}
          {section === 'settings' && <Settings />}
        </main>
      </div>
      <FirstRunModal />
    </div>
  );
}
