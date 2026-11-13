import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  filesUnder,
  imageMatrix,
  imagesOfKind,
  INFRA,
  packageHas,
  PACKAGES,
  PLAYWRIGHT_DOCKERFILE,
  readApps,
  REPO,
  WORKFLOWS,
  type ImageDeclaration,
} from './aws-deploy/apps';
import {
  containers,
  containersNamed,
  escapeRegExp,
  namesIn,
  namesWhole,
  prefixedNames,
  read,
  workflowJob,
} from './aws-deploy/templates';
import {
  blockOf,
  blocksOf,
  fieldOf,
  scalarOf,
  sequenceItems,
  sequenceOf,
  yamlLines,
  type YamlLine,
} from './aws-deploy/yaml-lines';

/**
 * The studio on AWS is deployed from one declaration.
 *
 * infra/aws/apps.json says what is deployed: each image, its kind, its port,
 * its health path and command, and what the gateway routes to it. Both
 * workflows' image matrices (through infra/aws/bin/image-matrix.js), the
 * templates' containers, the gateway's routes and the edge's cached paths
 * must all agree with it, or a deploy ships something the declaration never
 * said. The templates must also keep the model on the subscription (no API
 * key anywhere) and every secret-shaped variable a secret, and every name a
 * deploy reads from SSM must be in the setup document, so the owner's
 * one-time setup is complete by construction. The scheduled browser session
 * has a spec of its own, tooling/aws-deploy-jobs.spec.ts.
 */
const CI = join(WORKFLOWS, 'ci.yml');
const DEPLOY = join(WORKFLOWS, 'deploy-aws.yml');
const APP_TEMPLATE = join(INFRA, 'app.yaml');
const EDGE_TEMPLATE = join(INFRA, 'edge.yaml');
const APP_PARAMS = join(INFRA, 'params', 'prod', 'app.json');
const GUARD_RULES = join(INFRA, 'guard');
const IMAGE_MATRIX_SCRIPT = join(INFRA, 'bin', 'image-matrix.js');
const SHELL_LIBRARY = join(INFRA, 'bin', 'lib.sh');
const DEPLOYMENT_DOC = join(REPO, 'docs', 'aws', 'deployment.md');

/** The one API path a deploy reads without a session; every other public route is a web app's static assets. */
const HEALTH_ROUTE = '/api/health';
/** The hashed Next assets under a web app's base path: public JavaScript, cached at the edge. */
const STATIC_SUFFIX = '/_next/static';

/** A variable whose name says it holds a credential. */
const CREDENTIAL_NAME = /TOKEN|KEY|PASSWORD|SECRET/;

/** The one container named after an image, or a failure naming the image. */
function containerNamed(name: string): YamlLine[] {
  const found = containersNamed(name);
  expect(found.length, `${name} has one container definition`).toBe(1);
  return found[0] as YamlLine[];
}

describe('the AWS deployment is made from infra/aws/apps.json', () => {
  const apps = readApps();
  const images = Object.entries(apps.images);
  const served = images.filter(
    (entry): entry is [string, ImageDeclaration & { port: number }] => entry[1].port !== undefined,
  );

  it('[CLOUD-1] every image names a package of its declared kind, with what its Dockerfile takes', () => {
    const misnamed = images.filter(([name, { kind }]) => {
      if (kind === 'nest') return !packageHas(name, 'vite.config.ts', 'Tiltfile');
      if (kind === 'next') return !packageHas(name, 'next.config.js');
      // A job image: a Vite-built app with no Tiltfile (on the laptop it is a
      // CLI, not a pod), built on the Playwright Dockerfile.
      if (kind === 'playwright') {
        return (
          !packageHas(name, 'vite.config.ts') || !existsSync(join(REPO, PLAYWRIGHT_DOCKERFILE))
        );
      }
      return kind !== 'migrate';
    });
    expect(
      misnamed.map(([name]) => name),
      'no package of that kind',
    ).toEqual([]);

    // The task reaches each server on a declared port; a job image serves
    // nothing and declares none; a Next image bakes in one public URL
    // (docker/next-app.Dockerfile takes one PUBLIC_VAR) under a base path
    // that is empty or `/`-rooted with no trailing slash.
    const unservable = images.filter(
      ([, { kind, port }]) => kind !== 'migrate' && kind !== 'playwright' && !port,
    );
    expect(
      unservable.map(([name]) => name),
      'declares no port',
    ).toEqual([]);
    const serving = images.filter(
      ([, { kind, port }]) => kind === 'playwright' && port !== undefined,
    );
    expect(
      serving.map(([name]) => name),
      'a job image serves nothing',
    ).toEqual([]);
    const unbakeable = images.filter(
      ([, { kind, basePath, public: vars }]) =>
        kind === 'next' &&
        (Object.keys(vars ?? {}).length !== 1 || !/^(|\/[^/].*[^/])$/.test(basePath ?? '')),
    );
    expect(
      unbakeable.map(([name]) => name),
      'needs one public var and a base path',
    ).toEqual([]);
    expect(imagesOfKind(apps, 'migrate'), 'one migrate image').toHaveLength(1);
  });

  it('[CLOUD-1] the local-only images are the Nest apps the deploy leaves out, and no Nest app escapes both lists', () => {
    const localOnly = Object.entries(apps.localOnly ?? {});
    expect(
      localOnly.filter(
        ([name, { kind }]) => kind !== 'nest' || !packageHas(name, 'vite.config.ts', 'Tiltfile'),
      ),
      'a local-only image is a Nest app with a Tiltfile',
    ).toEqual([]);
    expect(
      localOnly.map(([name]) => name).filter((name) => name in apps.images),
      'declared as deployed and as local-only at once',
    ).toEqual([]);
    // Every Nest app Tilt runs is built by CI from a bare checkout, deployed or not.
    const nestApps = readdirSync(PACKAGES).filter((name) =>
      packageHas(name, 'vite.config.ts', 'Tiltfile'),
    );
    const declared = new Set([...Object.keys(apps.images), ...Object.keys(apps.localOnly ?? {})]);
    expect(
      nestApps.filter((name) => !declared.has(name)),
      'a Nest app with a Tiltfile that neither list names',
    ).toEqual([]);
  });

  it('[CLOUD-1] infra/aws/bin/image-matrix.js prints the matrix the declaration derives, with or without the local-only images', () => {
    const printed = (...flags: string[]) =>
      JSON.parse(
        execFileSync('node', [IMAGE_MATRIX_SCRIPT, ...flags], { cwd: REPO, encoding: 'utf8' }),
      ) as unknown;
    expect(printed()).toEqual(imageMatrix(apps));
    expect(printed('--with-local-only')).toEqual(imageMatrix(apps, { withLocalOnly: true }));
    expect(imageMatrix(apps, { withLocalOnly: true }).include.length).toBeGreaterThan(
      imageMatrix(apps).include.length,
    );
  });

  it('[CLOUD-1] both workflows take their image matrix from image-matrix.js and name no image; only CI adds the local-only images', () => {
    const derived = [
      { workflow: read(DEPLOY), source: 'resolve', flag: '' },
      { workflow: read(CI), source: 'image-matrix', flag: ' --with-local-only' },
    ];
    for (const { workflow, source, flag } of derived) {
      const matrixStep = workflowJob(workflow, source);
      expect(matrixStep, `${source} is a job of the workflow`).toBeDefined();
      expect(matrixStep).toContain(`node infra/aws/bin/image-matrix.js${flag}`);
      if (flag === '') expect(matrixStep).not.toContain('--with-local-only');
      const job = workflowJob(workflow, 'images');
      expect(job, 'images is a job of the workflow').toBeDefined();
      expect(job).toContain(`fromJSON(needs.${source}.outputs.images)`);
      const everyImage = [...images, ...Object.entries(apps.localOnly ?? {})].map(([name]) => name);
      expect(everyImage.filter((name) => job?.includes(name))).toEqual([]);
    }
  });

  it('[CLOUD-2] every container listens, is addressed and is checked on the port the declaration gives its image', () => {
    const named = containers().map((container) => scalarOf(container, 'Name') ?? '');
    expect(named.length, 'no container definitions read').toBeGreaterThan(0);
    expect(
      named.filter((name) => !(name in apps.images)),
      'containers the declaration does not name',
    ).toEqual([]);
    expect(
      served.filter(([name]) => !named.includes(name)).map(([name]) => name),
      'declared images with no container',
    ).toEqual([]);

    for (const [name, { port, health, command }] of served) {
      const container = containerNamed(name);
      const mapped = scalarOf(blockOf(container, 'PortMappings') ?? [], 'ContainerPort');
      expect(mapped, `${name} maps its port`).toBe(String(port));
      // The server itself is told the port through an environment entry; which
      // variable carries it is the package's own (PORT, QUALITY_LOOP_PORT, …).
      const environment = sequenceItems(blockOf(container, 'Environment') ?? []);
      expect(
        environment.some((entry) => fieldOf(entry, 'Value') === String(port)),
        `${name} is told port ${port}`,
      ).toBe(true);
      if (health !== undefined) {
        const check = sequenceOf(blockOf(container, 'HealthCheck') ?? [], 'Command') ?? [];
        expect(
          check.some((word) =>
            new RegExp(`127\\.0\\.0\\.1:${port}${escapeRegExp(health)}(?=\\s|$)`).test(word),
          ),
          `${name} is checked at 127.0.0.1:${port}${health}`,
        ).toBe(true);
      }
      expect(sequenceOf(container, 'Command'), `${name} runs its declared command`).toEqual(
        command,
      );
    }
  });

  it('[CLOUD-2] the gateway routes the app stack carries are the declaration’s, minified', () => {
    const expected = JSON.stringify(apps.routes);
    const parameters = blockOf(yamlLines(read(APP_TEMPLATE)), 'Parameters') ?? [];
    const written = scalarOf(blockOf(parameters, 'GatewayRoutes') ?? [], 'Default');
    const params = JSON.parse(read(APP_PARAMS)) as {
      ParameterKey: string;
      ParameterValue: string;
    }[];
    const given = params.find(
      ({ ParameterKey }) => ParameterKey === 'GatewayRoutes',
    )?.ParameterValue;

    expect(
      written ?? given,
      'neither the template nor params/prod/app.json carries GatewayRoutes',
    ).toBeDefined();
    if (written !== undefined) expect(written).toBe(expected);
    if (given !== undefined) expect(given).toBe(expected);
  });

  it('[CLOUD-2] every web app’s static assets and the health path are the only public routes, and the assets the only cached paths', () => {
    const statics = images
      .filter(([, { kind }]) => kind === 'next')
      .map(([name, { port, basePath }]) => ({
        name,
        port,
        prefix: `${basePath ?? ''}${STATIC_SUFFIX}`,
      }));
    expect(statics.length, 'no web app declared').toBeGreaterThan(0);
    // The edge forwards no cookie on a cached path, so the gate must never ask one for a session.
    for (const { name, port, prefix } of statics) {
      expect(
        apps.routes.find((route) => route.prefix === prefix),
        `${name}'s assets are a public route to its port`,
      ).toMatchObject({ port, public: true });
    }
    const publicPrefixes = apps.routes.filter((route) => route.public).map((route) => route.prefix);
    expect(publicPrefixes.sort()).toEqual(
      [...statics.map(({ prefix }) => prefix), HEALTH_ROUTE].sort(),
    );

    const behaviours = blocksOf(yamlLines(read(EDGE_TEMPLATE)), 'CacheBehaviors').flatMap(
      sequenceItems,
    );
    const cached = behaviours.flatMap((behaviour) =>
      /CachingOptimized/.test(scalarOf(behaviour, 'CachePolicyId') ?? '')
        ? [scalarOf(behaviour, 'PathPattern')]
        : [],
    );
    expect(cached.sort()).toEqual(statics.map(({ prefix }) => `${prefix}/*`).sort());
  });

  it('[CLOUD-2] the migrate container logs under its own name, the stream aws.sh reads back', () => {
    const [migrate = ''] = imagesOfKind(apps, 'migrate');
    const container = containerNamed(migrate);
    const options = blockOf(blockOf(container, 'LogConfiguration') ?? [], 'Options') ?? [];
    expect(scalarOf(options, 'awslogs-stream-prefix')).toBe(migrate);
    const declared = /^MIGRATE_CONTAINER='([^']+)'$/m.exec(read(SHELL_LIBRARY))?.[1];
    expect(declared, 'lib.sh names the migrate container').toBe(migrate);
  });

  it('[CLOUD-3] no template, parameter file, script or workflow names ANTHROPIC_API_KEY', () => {
    // The guard rules are what forbids the name, so they are the one place it may be written.
    const files = [...filesUnder(INFRA), ...filesUnder(WORKFLOWS)].filter(
      (file) => !file.startsWith(GUARD_RULES),
    );
    expect(files.length, 'nothing read').toBeGreaterThan(0);
    expect(
      files
        .filter((file) => read(file).includes('ANTHROPIC_API_KEY'))
        .map((file) => relative(REPO, file)),
    ).toEqual([]);
  });

  it('[CLOUD-3] a credential-named variable of a task definition is a secret, never environment', () => {
    const exposed = containers().flatMap((container) =>
      namesIn(blockOf(container, 'Environment') ?? [])
        .filter((name) => CREDENTIAL_NAME.test(name))
        .map((name) => `${scalarOf(container, 'Name')}: ${name}`),
    );
    expect(exposed, 'move it under Secrets, read from SSM').toEqual([]);

    const secrets = containers().flatMap((container) =>
      namesIn(blockOf(container, 'Secrets') ?? []),
    );
    expect(secrets, 'the task reads its credentials from somewhere').not.toEqual([]);
  });

  it('[CLOUD-4] every /sysdesign/prod name a template or parameter file references is in docs/aws/deployment.md', () => {
    const sources = filesUnder(INFRA).filter((file) => /\.(yaml|json)$/.test(file));
    const names = [...new Set(sources.flatMap((file) => prefixedNames(read(file))))].sort();
    expect(names, 'no prefixed name read from the templates').not.toEqual([]);
    expect(existsSync(DEPLOYMENT_DOC), 'docs/aws/deployment.md is the setup document').toBe(true);
    const doc = read(DEPLOYMENT_DOC);
    expect(
      names.filter((name) => !namesWhole(doc, name)),
      'name it in the setup document',
    ).toEqual([]);
  });
});
