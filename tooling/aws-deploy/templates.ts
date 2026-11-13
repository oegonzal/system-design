import { readFileSync } from 'node:fs';

import { filesUnder, INFRA } from './apps';
import {
  blockOf,
  blocksOf,
  fieldOf,
  keysOf,
  scalarOf,
  scalarOrSub,
  sequenceItems,
  yamlLines,
  type YamlLine,
} from './yaml-lines';

/**
 * What the AWS specs read out of the templates and the workflows, through
 * the line-based reader: a workflow's job, every container of every task
 * definition, a container's environment, a template's resources by type, its
 * exports, and the `/sysdesign/prod/…` names it writes. Each reader answers
 * with what it found and nothing else; the specs decide what a finding means.
 */

/** Where every parameter, secret and log group of the deployment is named (the contract's slug and environment). */
export const NAME_PREFIX = '/sysdesign/prod';

export const read = (path: string): string => readFileSync(path, 'utf8');

/** Every CloudFormation template under infra/aws. */
export const templates = (): string[] => filesUnder(INFRA).filter((file) => file.endsWith('.yaml'));

export const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * One job's block of a workflow, by its lines: from `  <name>:` to the next
 * job key, the way tooling/code-review/config.spec.ts slices the review job;
 * undefined when the workflow has no such job.
 */
export function workflowJob(workflow: string, name: string): string | undefined {
  const start = workflow.indexOf(`\n  ${name}:`);
  if (start === -1) return undefined;
  const job = workflow.slice(start);
  const end = job.slice(1).search(/\n {2}[a-z][a-z-]*:\n/);
  return end === -1 ? job : job.slice(0, end + 1);
}

/** Every container of every task definition in every template, as the lines under its `- Name`. */
export function containers(): YamlLine[][] {
  return templates().flatMap((template) =>
    blocksOf(yamlLines(read(template)), 'ContainerDefinitions').flatMap(sequenceItems),
  );
}

/** The `Name` of every item of a container's `Environment` or `Secrets` list. */
export const namesIn = (lines: readonly YamlLine[]): string[] =>
  sequenceItems(lines).flatMap((item) => fieldOf(item, 'Name') ?? []);

/** The containers named after an image, across every template; the specs expect exactly one. */
export function containersNamed(name: string): YamlLine[][] {
  return containers().filter((container) => scalarOf(container, 'Name') === name);
}

/** The value of a container's `Environment` entry, a `!Sub` read as its template string; undefined without the entry. */
export function environmentValue(container: readonly YamlLine[], name: string): string | undefined {
  const entry = sequenceItems(blockOf(container, 'Environment') ?? []).find(
    (item) => fieldOf(item, 'Name') === name,
  );
  return entry === undefined ? undefined : scalarOrSub(entry, 'Value');
}

/** A resource of a template: its logical name and the lines under its `Properties`. */
export interface TemplateResource {
  name: string;
  properties: YamlLine[];
}

/** Every resource of one CloudFormation type in a template, in the template's order. */
export function resourcesOfType(source: string, type: string): TemplateResource[] {
  const resources = blockOf(yamlLines(source), 'Resources') ?? [];
  return keysOf(resources).flatMap((name) => {
    const resource = blockOf(resources, name) ?? [];
    return scalarOf(resource, 'Type') === type
      ? [{ name, properties: blockOf(resource, 'Properties') ?? [] }]
      : [];
  });
}

/** The `Default` of a template parameter, or undefined without one. */
export function parameterDefault(source: string, name: string): string | undefined {
  const parameters = blockOf(yamlLines(source), 'Parameters') ?? [];
  return scalarOf(blockOf(parameters, name) ?? [], 'Default');
}

/** The logical name of the resource a template exports under `exportName` as `!Ref <name>`, or undefined. */
export function exportedResource(source: string, exportName: string): string | undefined {
  const outputs = blockOf(yamlLines(source), 'Outputs') ?? [];
  for (const key of keysOf(outputs)) {
    const output = blockOf(outputs, key) ?? [];
    if (scalarOf(blockOf(output, 'Export') ?? [], 'Name') === exportName) {
      return /^!Ref (\w+)$/.exec(scalarOf(output, 'Value') ?? '')?.[1];
    }
  }
  return undefined;
}

/**
 * Every `/sysdesign/prod/…` name a template writes: literally, or through a
 * parameter whose default starts with the prefix (`${SecretsPrefix}/DB_PASSWORD`).
 * A trailing wildcard or slash names a policy scope, not a thing, and is dropped.
 */
export function prefixedNames(source: string): string[] {
  const template = yamlLines(source);
  const parameters = blockOf(template, 'Parameters') ?? [];
  const defaults = new Map(
    keysOf(parameters).flatMap((name) => {
      const value = scalarOf(blockOf(parameters, name) ?? [], 'Default');
      return value?.startsWith(NAME_PREFIX) ? [[name, value] as const] : [];
    }),
  );
  const literal = [...source.matchAll(/\/sysdesign\/prod(?:\/[\w./-]*)?/g)].map(([name]) => name);
  const expanded = [...source.matchAll(/\$\{(\w+)\}((?:\/[\w./-]*)?)/g)].flatMap(
    ([, name, rest]) => (defaults.has(name ?? '') ? [`${defaults.get(name ?? '')}${rest}`] : []),
  );
  return [...new Set([...literal, ...expanded].map((name) => name.replace(/\/$/, '')))].filter(
    (name) => name !== NAME_PREFIX,
  );
}

/** Whether a document names the thing itself, not a longer name it is a prefix of. */
export const namesWhole = (document: string, name: string): boolean =>
  new RegExp(`${escapeRegExp(name)}(?![\\w/-])`).test(document);
