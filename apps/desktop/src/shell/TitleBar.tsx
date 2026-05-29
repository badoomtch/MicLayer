// Custom title bar (decorations disabled in tauri.conf.json).
// Drag region is provided by the `.ml-titlebar` CSS class which sets
// `-webkit-app-region: drag`. The min / max / close buttons opt out via
// `.ml-tb-btn` (which has `app-region: no-drag`).

import { Minus, Square, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { Lockup } from '../shared/Logo';

export function TitleBar() {
  const onMinimize = () => getCurrentWindow().minimize();
  const onMaximize = () => getCurrentWindow().toggleMaximize();
  const onClose = () => getCurrentWindow().hide();
  return (
    <div className="ml-titlebar">
      <div className="ml-tb-left">
        <Lockup size={18} color="var(--ml-fg)" />
      </div>
      <div className="ml-tb-mid" />
      <div className="ml-tb-right">
        <button className="ml-tb-btn" aria-label="Minimise" onClick={onMinimize}>
          <Minus size={14} />
        </button>
        <button className="ml-tb-btn" aria-label="Maximise" onClick={onMaximize}>
          <Square size={12} />
        </button>
        <button className="ml-tb-btn close" aria-label="Hide" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
