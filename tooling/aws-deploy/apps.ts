import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The one declaration of what is deployed to AWS, infra/aws/apps.json, as the
 * specs read it, beside the facts about the packages it names that the
 * repository itself declares: a Nest app Tilt runs has a Tiltfile beside its
 * vite.config.ts, a Next app a next.config.js, and a playwright job image a
 * vite.config.ts and the Playwright Dockerfile. The image matrix both
 * workflows build from is derived here too, so infra/aws/bin/image-matrix.js
 * is held to a derivation the spec owns rather than to its own output.
 */
export const REPO = join(__dirname, '..', '..');
export const INFRA = join(REPO, 'infra', 'aws');
export const WORKFLOWS = join(REPO, '.github', 'workflows');
export const PACKAGES = join(REPO, 'packages');

export type ImageKind = 'nest' | 'next' | 'playwright' | 'migrate';

export interface ImageDeclaration {
  kind: ImageKind;
  port?: number;
  health?: string;
  command?: string[];
  basePath?: string;
  /** The one `NEXT_PUBLIC_*` variable a Next image bakes in, and its value. */
  public?: Record<string, string>;
}

export interface RouteDeclaration {
  prefix: string;
  port: number;
  strip?: boolean;
  api?: boolean;
  /** The gate never asks a session of the route, and it never wakes the task. */
  public?: boolean;
}

/**
 * A scheduled job: a playwright image run as a one-off task, once per launch,
 * with the command template's `{launch}` replaced by the launch's name. Each
 * launch is a file under the image's package, `launches/<name>.json`, and a
 * schedule expression in UTC.
 */
export interface JobDeclaration {
  image: string;
  command: string[];
  launches: Record<string, { schedule: string }>;
}

export interface AppsDeclaration {
  images: Record<string, ImageDeclaration>;
  /** The Nest apps that never deploy but CI still builds, so the bare-checkout guard covers every app. */
  localOnly?: Record<string, ImageDeclaration>;
  jobs?: Record<string, JobDeclaration>;
  routes: RouteDeclaration[];
}

export function readApps(): AppsDeclaration {
  return JSON.parse(readFileSync(join(INFRA, 'apps.json'), 'utf8')) as AppsDeclaration;
}

/** The images of one kind, by name, in the declaration's order. */
export function imagesOfKind(apps: AppsDeclaration, kind: ImageKind): string[] {
  return Object.entries(apps.images)
    .filter(([, image]) => image.kind === kind)
    .map(([name]) => name);
}

/** Whether the package named carries every one of these files. */
export function packageHas(name: string, ...files: string[]): boolean {
  return files.every((file) => existsSync(join(PACKAGES, name, file)));
}

/** The launch file a job's image reads for one launch name: `packages/<image>/launches/<name>.json`. */
export function launchFile(image: string, launch: string): string {
  return join(PACKAGES, image, 'launches', `${launch}.json`);
}

/** The word of a job's command template that a launch's name replaces. */
export const LAUNCH_PLACEHOLDER = '{launch}';

/** One entry of the image matrix: what a build step needs and nothing it must know by name. */
export interface ImageMatrixEntry {
  image: string;
  /** The Dockerfile, relative to the repository root. */
  file: string;
  /** The build stage, or empty for the Dockerfile's last. */
  target: string;
  /** `KEY=value` build arguments, one per line, as docker/build-push-action takes them. */
  build_args: string;
}

const NEST_DOCKERFILE = 'docker/nest-app.Dockerfile';
const NEXT_DOCKERFILE = 'docker/next-app.Dockerfile';
export const PLAYWRIGHT_DOCKERFILE = 'docker/playwright-app.Dockerfile';

/**
 * The image matrix the declaration derives, in its order: a Nest image is the
 * Nest Dockerfile with `APP`, a Next image the Next Dockerfile with `APP`,
 * `BASE_PATH` and its one public variable, a playwright image the Playwright
 * Dockerfile with `APP`, and the migrate image the Nest Dockerfile's `migrate`
 * stage with no arguments. With `withLocalOnly` the `localOnly` images follow
 * the deployed ones, as CI builds them.
 */
export function imageMatrix(
  apps: AppsDeclaration,
  { withLocalOnly = false }: { withLocalOnly?: boolean } = {},
): { include: ImageMatrixEntry[] } {
  const declared = withLocalOnly ? { ...apps.images, ...(apps.localOnly ?? {}) } : apps.images;
  const include = Object.entries(declared).map(([image, spec]): ImageMatrixEntry => {
    if (spec.kind === 'migrate') {
      return { image, file: NEST_DOCKERFILE, target: 'migrate', build_args: '' };
    }
    if (spec.kind === 'next') {
      const [name = '', url = ''] = Object.entries(spec.public ?? {})[0] ?? [];
      const args = [
        `APP=${image}`,
        `BASE_PATH=${spec.basePath ?? ''}`,
        `PUBLIC_VAR=${name}`,
        `PUBLIC_URL=${url}`,
      ];
      return { image, file: NEXT_DOCKERFILE, target: '', build_args: args.join('\n') };
    }
    if (spec.kind === 'playwright') {
      return { image, file: PLAYWRIGHT_DOCKERFILE, target: '', build_args: `APP=${image}` };
    }
    return { image, file: NEST_DOCKERFILE, target: '', build_args: `APP=${image}` };
  });
  return { include };
}

/** Every file under a folder, recursively, as absolute paths. */
export function filesUnder(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder).flatMap((entry) => {
    const path = join(folder, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}
