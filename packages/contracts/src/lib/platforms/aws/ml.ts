import type { PlatformService } from '../service';
import type { AwsCategoryId } from './categories';

/** The models a design trains, hosts or calls as an API. */
export const MACHINE_LEARNING = [
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
  {
    id: 'aws.rekognition',
    label: 'Rekognition',
    category: 'ml',
    roles: ['ml-inference'],
    what: 'Image and video analysis as an API: labels, faces, text, unsafe content — synchronous for images, asynchronous jobs for video.',
    whenToUse:
      'Moderation, tagging or search over uploaded media without training a model; video answers by job, never inline.',
    knobs: ['operations', 'moderationLabels', 'minConfidence', 'videoJobs', 'customLabels'],
    aliases: ['vision', 'image analysis', 'moderation', 'rekognition'],
  },
  {
    id: 'aws.textract',
    label: 'Textract',
    category: 'ml',
    roles: ['ml-inference'],
    what: 'Extracts text, forms, tables and signatures from documents and images, synchronously for pages and as jobs for files.',
    whenToUse:
      'Documents arriving as scans or PDFs that must become fields: invoices, forms, identity documents.',
    knobs: ['features', 'queries', 'asyncJobs', 'adapters', 'outputFormat'],
    aliases: ['ocr', 'documents', 'extraction', 'textract'],
  },
  {
    id: 'aws.comprehend',
    label: 'Comprehend',
    category: 'ml',
    roles: ['ml-inference'],
    what: 'Natural-language analysis as an API: entities, sentiment, key phrases, language, PII, and custom classifiers.',
    whenToUse:
      'Text that must be classified, redacted or enriched at volume without a model of your own.',
    knobs: ['operations', 'customModels', 'piiRedaction', 'languages', 'batchJobs'],
    aliases: ['nlp', 'sentiment', 'entities', 'pii', 'comprehend'],
  },
  {
    id: 'aws.transcribe',
    label: 'Transcribe',
    category: 'ml',
    roles: ['ml-inference'],
    what: 'Speech to text, streaming or batch, with speaker labels, custom vocabularies and PII redaction.',
    whenToUse:
      'Calls, meetings or media that must become text — live for captions, batch for archives.',
    knobs: ['mode', 'languages', 'speakerLabels', 'customVocabulary', 'redaction'],
    aliases: ['speech to text', 'captions', 'transcription', 'transcribe'],
  },
] as const satisfies readonly PlatformService<AwsCategoryId>[];
