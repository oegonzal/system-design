import { toolSessionSettingsSchema } from './settings';
import { sampleSettings } from './session/testing';

describe('the session settings', () => {
  it('[TSS-7] reads a complete file and refuses one with a field missing or wrong, by name', () => {
    const settings = sampleSettings();
    expect(toolSessionSettingsSchema.parse(settings)).toEqual(settings);
    const missing = toolSessionSettingsSchema.safeParse({
      ...settings,
      rails: { ...settings.rails, maxSteps: undefined },
    });
    expect(missing.success).toBe(false);
    expect(missing.success ? '' : missing.error.issues[0]?.path.join('.')).toBe('rails.maxSteps');
    expect(toolSessionSettingsSchema.safeParse({ ...settings, pollEveryMs: 0 }).success).toBe(
      false,
    );
    expect(toolSessionSettingsSchema.safeParse({ ...settings, extra: true }).success).toBe(false);
  });
});
