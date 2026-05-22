import { useAppStore, type SectionId } from '../state/useAppStore';

const items: { id: SectionId; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'tune', label: 'Tune' },
  { id: 'profiles', label: 'Profiles' },
  { id: 'settings', label: 'Settings' },
];

export function Sidebar() {
  const { section, setSection } = useAppStore((s) => ({
    section: s.ui.section,
    setSection: s.setSection,
  }));

  return (
    <nav className="flex w-48 flex-col gap-1 border-r border-surface/60 bg-surface/40 p-3">
      {items.map((item) => {
        const active = section === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setSection(item.id)}
            className={
              'rounded-card px-3 py-2 text-left text-sm transition-colors ' +
              (active
                ? 'bg-accent/15 text-fg'
                : 'text-muted hover:bg-surface hover:text-fg')
            }
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
