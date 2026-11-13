import type { Criterion } from './criterion';

/**
 * The studio on AWS (infra/aws, docker/, .github/workflows/deploy-aws.yml): one
 * Fargate task behind one edge, plus the browser session as a scheduled
 * one-off task, declared in CloudFormation and deployed by GitHub Actions from
 * the one declaration in infra/aws/apps.json.
 */
export const CLOUD_CRITERIA: readonly Criterion[] = [
  {
    id: 'CLOUD-1',
    statement:
      'What is deployed is declared once: every image in infra/aws/apps.json names a package of its declared kind — a Nest app with a Tiltfile, a Next app, the migrate stage, or a playwright job image that serves no port and builds on the Playwright Dockerfile — the local-only list names the Nest apps the deploy leaves out so no Nest app with a Tiltfile escapes both, infra/aws/bin/image-matrix.js prints the image matrix that declaration derives (CI alone adding the local-only images), and both the CI and the deploy workflow build from that script’s output rather than listing images of their own.',
  },
  {
    id: 'CLOUD-2',
    statement:
      'The task and the edge agree with the declaration: every container maps the port apps.json declares for its image, is told it through an environment entry, is health-checked at 127.0.0.1 on that port and path, and runs its declared command; the gateway routes the template carries are the declaration’s routes, byte for byte; every web app’s _next/static prefix is a public route to its port and a CachingOptimized behaviour at the edge, and /api/health is the only other public route; the migrate container’s log stream prefix is its name, the one aws.sh reads back; and the browser-session task reaches the loop, notifications and the two lanes at app.<namespace> on the ports the declaration gives them, each admitted from the session task’s own security group, and runs the bundled Chromium.',
  },
  {
    id: 'CLOUD-3',
    statement:
      'The model is reached on the subscription alone and secrets never ride as plain environment: no template, parameter file, script or workflow names ANTHROPIC_API_KEY, and every token-, key-, password- or secret-named variable of a task definition is a secret, never an environment value.',
  },
  {
    id: 'CLOUD-4',
    statement:
      'Every SSM parameter a template or parameter file references — the secrets the owner creates and the idle state the app stack declares — is named whole in the deployment document, so the owner’s one-time setup names everything a deploy will read.',
  },
  {
    id: 'CLOUD-5',
    statement:
      'A scheduled job is declared once: its image is a playwright image, every launch it names has a file under packages/browser-session/launches/, the templates carry one schedule per launch with that expression and {"launch":"<name>"} as input, in a state that defaults to DISABLED, and the job function’s command template and launch list equal the declaration, as does the container name whose log stream aws.sh session logs tails.',
  },
  {
    id: 'CLOUD-6',
    statement:
      'The stacks stay updatable: no stack imports a task-definition revision — no !ImportValue names an export whose value is a !Ref of an AWS::ECS::TaskDefinition, whose ARN changes with every tag — and the job function runs the session task by the family the platform stack exports, which is the session task definition’s own.',
  },
];
