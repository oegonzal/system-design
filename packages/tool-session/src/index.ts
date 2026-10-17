/**
 * @sysdesign/tool-session — a mission run as tool calls the quality loop
 * decides, for any program that declares tools: the catalog, the session and
 * its registry, the Nest module that serves both, the command line that runs
 * one mission, and the settings a program ships. The fakes a program's specs
 * take are `@sysdesign/tool-session/testing`.
 */
export * from './catalog';
export * from './cli';
export * from './nest';
export * from './session';
export {
  railsSettingsSchema,
  toolSessionSettingsSchema,
  type RailsSettings,
  type ToolSessionSettings,
} from './settings';
