import type { PlatformService } from '../service';
import type { AwsCategoryId } from './categories';

/** Who may do what, how the system is watched, and the models it calls. */
export const SECURITY_MANAGEMENT_AND_ML = [
  {
    id: 'aws.cognito',
    label: 'Cognito',
    category: 'security',
    roles: ['auth-service'],
    what: 'User pools that sign users up and in — passwords, MFA, social and SAML federation — and issue the JWTs your APIs verify.',
    whenToUse:
      'Any application with its own users; hand it to API Gateway or AppSync as the authorizer instead of writing login.',
    knobs: [
      'userPool',
      'identityPool',
      'tokenExpirySeconds',
      'mfa',
      'federation',
      'hostedUi',
      'triggers',
    ],
    aliases: ['auth', 'login', 'oidc', 'identity', 'users'],
  },
  {
    id: 'aws.kms',
    label: 'KMS',
    category: 'security',
    roles: ['secrets-manager'],
    what: 'Managed encryption keys: envelope encryption, rotation, key policies and grants, with every use logged.',
    whenToUse:
      'Encrypting data at rest in every store, signing tokens, and proving who could decrypt what.',
    knobs: ['keyType', 'rotation', 'keyPolicy', 'grants', 'multiRegion', 'envelopeEncryption'],
    aliases: ['keys', 'encryption', 'kms'],
  },
  {
    id: 'aws.secrets-manager',
    label: 'Secrets Manager',
    category: 'security',
    roles: ['secrets-manager'],
    what: 'Stores credentials, API keys and certificates encrypted, rotates them on a schedule and serves them to code at run time.',
    whenToUse:
      'Any secret a service needs — never in an image or an environment file; rotate database passwords without a deploy.',
    knobs: ['rotation', 'rotationLambda', 'replication', 'versionStages', 'cacheTtlSeconds'],
    aliases: ['secrets', 'credentials', 'passwords', 'rotation'],
  },
  {
    id: 'aws.waf',
    label: 'WAF',
    category: 'security',
    roles: ['waf'],
    what: 'A web application firewall on CloudFront, ALB or API Gateway: managed rule sets, rate-based rules, geo and bot controls.',
    whenToUse:
      'Every internet-facing entry point: block injection and bots, rate-limit abusers before they reach your compute.',
    knobs: [
      'webAcl',
      'managedRules',
      'rateBasedRules',
      'geoMatch',
      'botControl',
      'scope',
      'shieldAdvanced',
    ],
    aliases: ['firewall', 'ddos', 'rate limit'],
  },
  {
    id: 'aws.cloudwatch',
    label: 'CloudWatch',
    category: 'management',
    roles: ['monitoring', 'logging'],
    what: 'Metrics, alarms, dashboards and logs in one place: every managed service publishes here, and your code can too.',
    whenToUse:
      'Always — alarm on the symptoms users feel, keep log groups with a retention, and dashboard the request path.',
    knobs: [
      'metrics',
      'alarms',
      'dashboards',
      'logGroups',
      'retentionDays',
      'metricFilters',
      'compositeAlarms',
      'canaries',
    ],
    aliases: ['metrics', 'alarms', 'logs', 'dashboards'],
  },
  {
    id: 'aws.xray',
    label: 'X-Ray',
    category: 'management',
    roles: ['tracing'],
    what: 'Distributed tracing: one trace id follows a request across functions, services and managed calls into a service map.',
    whenToUse:
      'A request that crosses several hops — find the slow or failing one, and see which dependency it was.',
    knobs: ['samplingRate', 'serviceMap', 'annotations', 'traceIdPropagation', 'groups'],
    aliases: ['tracing', 'otel', 'traces', 'spans'],
  },
  {
    id: 'aws.cloudtrail',
    label: 'CloudTrail',
    category: 'management',
    roles: ['logging'],
    what: 'The audit log of every API call made to the account — who did what, when, from where — retained and queryable.',
    whenToUse: 'Compliance, forensics and change auditing; alarm on calls nobody should be making.',
    knobs: ['trails', 'dataEvents', 'retention', 'lakeQueries', 'integrity'],
    aliases: ['audit', 'api calls', 'compliance'],
  },
  {
    id: 'aws.parameter-store',
    label: 'Systems Manager Parameter Store',
    category: 'management',
    roles: ['config-service'],
    what: 'Hierarchical configuration values and secure strings, versioned, read by services at start or on change.',
    whenToUse:
      'Feature flags, endpoints and tunables that differ by environment and must change without a redeploy.',
    knobs: ['tier', 'secureString', 'hierarchy', 'versioning', 'cacheTtlSeconds'],
    aliases: ['config', 'ssm', 'parameters', 'feature flags'],
  },
  {
    id: 'aws.sagemaker',
    label: 'SageMaker',
    category: 'ml',
    roles: ['ml-inference'],
    what: 'Hosted model endpoints — real-time, serverless or asynchronous — with autoscaling, variants and a model registry.',
    whenToUse:
      'Serving your own trained models behind an API, A/B testing variants, or batch scoring a dataset.',
    knobs: [
      'endpointType',
      'instanceType',
      'autoscaling',
      'serverless',
      'multiModel',
      'asyncInference',
    ],
    aliases: ['model', 'inference', 'endpoint', 'ml'],
  },
  {
    id: 'aws.bedrock',
    label: 'Bedrock',
    category: 'ml',
    roles: ['ml-inference'],
    what: 'Foundation models behind one API — text, embeddings, images — with guardrails, knowledge bases and provisioned throughput.',
    whenToUse:
      'Generative features — summaries, answers over your documents, extraction — without hosting a model.',
    knobs: [
      'model',
      'provisionedThroughput',
      'guardrails',
      'knowledgeBase',
      'streaming',
      'tokensPerMinute',
    ],
    aliases: ['llm', 'genai', 'foundation model', 'embeddings'],
  },
] as const satisfies readonly PlatformService<AwsCategoryId>[];
