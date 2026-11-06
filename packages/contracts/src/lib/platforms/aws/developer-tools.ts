import type { PlatformService } from '../service';
import type { AwsCategoryId } from './categories';

/** How a change is built, kept and shipped. */
export const DEVELOPER_TOOLS = [
  {
    id: 'aws.codebuild',
    label: 'CodeBuild',
    category: 'developer-tools',
    roles: ['build-service'],
    what: 'Managed build runners that compile, test and package a change into an artifact on every push, with no fleet to keep.',
    whenToUse:
      'Every deployable: the build that produces the image, bundle or template the pipeline ships, logged and repeatable.',
    knobs: [
      'buildSpec',
      'computeType',
      'cache',
      'artifacts',
      'environmentImage',
      'timeoutMinutes',
      'concurrency',
    ],
    aliases: ['build', 'ci', 'codebuild'],
  },
  {
    id: 'aws.codepipeline',
    label: 'CodePipeline',
    category: 'developer-tools',
    roles: ['deployment-pipeline'],
    what: 'Models a release as stages — source, build, test, approve, deploy — and runs every change through them in order.',
    whenToUse:
      'More than one deployable or environment, or a release with gates: one definition the whole team ships through.',
    knobs: [
      'stages',
      'source',
      'approvals',
      'artifactStore',
      'parallelActions',
      'triggers',
      'variables',
    ],
    aliases: ['pipeline', 'cd', 'release', 'codepipeline'],
  },
  {
    id: 'aws.codedeploy',
    label: 'CodeDeploy',
    category: 'developer-tools',
    roles: ['deployment-service'],
    what: 'Rolls a revision out to EC2, ECS or Lambda — in place, blue/green or canary — and rolls back on failed health checks or alarms.',
    whenToUse:
      'A service with users on it: a rollout that watches alarms and reverses itself, instead of a redeploy by hand.',
    knobs: [
      'deploymentType',
      'trafficShifting',
      'healthChecks',
      'rollbackOnAlarm',
      'deploymentGroup',
      'hooks',
    ],
    aliases: ['deploy', 'blue/green', 'canary', 'rollback', 'codedeploy'],
  },
  {
    id: 'aws.ecr',
    label: 'ECR',
    category: 'developer-tools',
    roles: ['artifact-registry'],
    what: 'A private container registry: immutable image tags, vulnerability scanning on push, lifecycle rules and cross-region replication.',
    whenToUse:
      'Every container the fleet runs: images pulled by digest at deploy time, scanned before they ship.',
    knobs: [
      'repositories',
      'tagImmutability',
      'scanOnPush',
      'lifecyclePolicy',
      'replication',
      'encryption',
    ],
    aliases: ['registry', 'images', 'docker', 'containers', 'ecr'],
  },
  {
    id: 'aws.codeartifact',
    label: 'CodeArtifact',
    category: 'developer-tools',
    roles: ['artifact-registry'],
    what: 'A package repository for npm, Maven, PyPI and NuGet artifacts, with upstream proxies and versioned domains.',
    whenToUse:
      'Shared libraries across services: one place versions live, pinned by the builds that consume them.',
    knobs: ['domain', 'repositories', 'upstreams', 'packageFormats', 'retention'],
    aliases: ['packages', 'npm', 'maven', 'pypi', 'artifacts'],
  },
  {
    id: 'aws.cloudformation',
    label: 'CloudFormation',
    category: 'developer-tools',
    roles: ['infrastructure-as-code'],
    what: 'Declares infrastructure as templates — by hand or with the CDK — applied as stacks with change sets, drift detection and rollback.',
    whenToUse:
      'Any environment built more than once: staging and production from one definition, every change reviewed as a diff.',
    knobs: [
      'stacks',
      'changeSets',
      'driftDetection',
      'stackSets',
      'parameters',
      'rollbackTriggers',
      'nestedStacks',
    ],
    aliases: ['iac', 'cdk', 'templates', 'stacks', 'terraform'],
  },
] as const satisfies readonly PlatformService<AwsCategoryId>[];
