/**
 * @sysdesign/config-kit — choosing a program's configuration by name: a root's
 * `config/engine.json` names one file per kind under `config/<kind>/`, and the
 * kind's owner reads it against its own schema.
 */
export * from './engine-config';
