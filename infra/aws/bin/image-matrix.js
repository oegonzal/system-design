#!/usr/bin/env node
/**
 * The image matrix of both workflows, derived from infra/aws/apps.json — the
 * one place that says what is built. Prints `{ include: [...] }` for a job's
 * `strategy.matrix`: each entry names the image, its Dockerfile, the build
 * target and the build arguments (one `KEY=value` per line, the way
 * docker/build-push-action reads `build-args`), so a workflow has one build
 * step and knows no image by name.
 *
 * Four kinds: a Nest app and a Next app each take their Dockerfile with `APP`
 * (the Next one with its base path and public URL too), the migrate image is
 * the Nest Dockerfile's `migrate` stage, and a `playwright` image — a job the
 * schedules run, not a server — is the Debian Playwright Dockerfile with
 * `APP`, since the bundled Chromium does not run on the Alpine the Nest
 * image is built from.
 *
 * `--with-local-only` adds the declaration's `localOnly` images: the Nest apps
 * that run on the laptop and never deploy, which CI still builds so the
 * "builds from a bare checkout" guard covers every app. The deploy workflow
 * never passes the flag. tooling/aws-deploy.spec.ts asserts both outputs
 * against apps.json, and an image kind the Dockerfiles do not know is refused
 * here rather than built as something else.
 */
'use strict';

const { images, localOnly = {} } = require('../apps.json');

const NEST_DOCKERFILE = 'docker/nest-app.Dockerfile';
const NEXT_DOCKERFILE = 'docker/next-app.Dockerfile';
const PLAYWRIGHT_DOCKERFILE = 'docker/playwright-app.Dockerfile';

const entryFor = ([image, spec]) => {
  switch (spec.kind) {
    case 'nest':
      return { image, file: NEST_DOCKERFILE, target: '', build_args: `APP=${image}` };
    case 'next': {
      const [name, url] = Object.entries(spec.public)[0];
      const args = [
        `APP=${image}`,
        `BASE_PATH=${spec.basePath}`,
        `PUBLIC_VAR=${name}`,
        `PUBLIC_URL=${url}`,
      ];
      return { image, file: NEXT_DOCKERFILE, target: '', build_args: args.join('\n') };
    }
    case 'playwright':
      return { image, file: PLAYWRIGHT_DOCKERFILE, target: '', build_args: `APP=${image}` };
    case 'migrate':
      return { image, file: NEST_DOCKERFILE, target: 'migrate', build_args: '' };
    default:
      throw new Error(
        `${image} is declared as '${spec.kind}'; the matrix knows nest, next, playwright and migrate`,
      );
  }
};

const withLocalOnly = process.argv.includes('--with-local-only');
const declared = withLocalOnly ? { ...images, ...localOnly } : images;

process.stdout.write(JSON.stringify({ include: Object.entries(declared).map(entryFor) }));
