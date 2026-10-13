import { WINDOW_PRESETS, type WindowPreset } from '@sysdesign/contracts';
import { ChipGroup } from '@sysdesign/design-system';

export interface WindowPresetsProps {
  preset: WindowPreset;
  onPresetChange(preset: WindowPreset): void;
  disabled?: boolean;
}

/** The window a lens reads over, as one choice among the declared presets. */
export function WindowPresets({ preset, onPresetChange, disabled = false }: WindowPresetsProps) {
  return (
    <ChipGroup
      label="Window"
      options={WINDOW_PRESETS}
      value={[preset]}
      disabled={disabled}
      onToggle={(id) => {
        const chosen = WINDOW_PRESETS.find((option) => option.id === id);
        if (chosen) onPresetChange(chosen.id);
      }}
    />
  );
}
