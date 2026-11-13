/**
 * @sysdesign/config-kit — choosing a program's configuration by name: a root's
 * `config/engine.json` names one file per kind under `config/<kind>/` — or the
 * kind's owner names one itself — and the owner reads it against its own schema.
 */
export * from './engine-config';
