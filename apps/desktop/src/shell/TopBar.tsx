import { ProfilePicker } from '../shared/ProfilePicker';

export function TopBar() {
  return (
    <header className="flex h-12 items-center justify-between border-b border-surface/60 bg-surface px-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold tracking-tight">MicLayer</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">Profile</span>
        <ProfilePicker />
      </div>
    </header>
  );
}
