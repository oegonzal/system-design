/**
 * The studio's pipeline: a canvas drawn by a person, judged against the prompt
 * it answers, and — when the studio asks for more than one iteration —
 * coached. Everything the studio's own engine once knew about system design
 * lives in the lens personas beside this file; the definition itself is kinds,
 * types, weights and gates.
 *
 * A design is graded as the competencies a senior software-design interview
 * asks for, each a criterion kind the contract declares
 * (`CANVAS_CRITERION_KINDS`): what the system must do (coverage); the data it
 * keeps, the contracts it exposes, where responsibility is split and the
 * processes it carries (design); the quality targets, the load it is sized
 * for and how it arrives and changes (qualities); the decisions it defends
 * (reasoning); the rules it may not break (compliance). Scale is one kind
 * among eleven and earns only what a prompt's own figures give it.
 *
 * Four things shape the policy:
 *
 * 1. A dimension is earned by its criteria. One with no criteria on a prompt
 *    and no findings leaves the score; one with findings but no criteria
 *    starts at 100 and can only fall. Reasoning therefore rides on the three
 *    standing criteria the studio appends to every rubric
 *    (`CANVAS_STANDING_CRITERIA`) — every decision defended, every binding
 *    that had a choice saying why, the assumptions stated — so it is
 *    earnable on every prompt, and on the trade-off rows a prompt states.
 *    The author writes those defences where the claims are: a trade-off on
 *    each binding, an "instead of" on each rationale, and the decisions
 *    list in the narrative.
 * 2. A finding prices where its critic's kinds earn. The explanation
 *    failures — a claim the diagram does not back, a part nobody explains, a
 *    narration that contradicts the drawing, a decision with no alternative —
 *    price onto reasoning; a defect of the data, the contracts, the seams or
 *    a process onto design; a target or a figure missed onto qualities.
 * 3. Proportion. The fitness critic holds a design to the goal's own figures,
 *    and over-building where the goal states no load is a defect too.
 * 4. Communication is a competency of design: how the parts talk, hop by hop,
 *    and whether a request can be walked from where it enters to where it
 *    comes to rest — earned by the three standing communication criteria and
 *    the request paths a prompt names, and charged by a critic of its own.
 *    The goal's request lifecycle declares what a request from outside passes
 *    on its way in, where a request comes to rest and that every component
 *    lies on or beside a traced path; the render states those facts under
 *    every path and a warn validator lists what is absent, so a lens judges
 *    whether an absence is a defect here and never whether it is there.
 *    Where the goal declares a platform and its catalogue, every lens reads a
 *    component as the service it names, a hop as an integration that
 *    platform offers and a block's boundary as where the platform lets it
 *    sit: one shared paragraph (`lenses/platform.md`) says so in the shape of
 *    the work, and no lens knows a vendor by name. The goal's canvas
 *    vocabulary defines every role a block may play, so a lens reads a kind
 *    by the author's own definition.
 * 5. Operations are a quality of the design: the standing evolution row asks
 *    how it is built, delivered, rolled out and back, observed and backed up,
 *    and the delivery, observability and backup roles are what answers it.
 *
 * The studio always provides the artifact, so the producer is the coach: it
 * runs on revise only — the controller never decides retry, because a fresh
 * attempt would replace the author's canvas with the model's — and is told
 * to keep the author's ids and to prefix anything it adds with `ai-` so the
 * studio can tell the two apart.
 */
import {
  CANVAS_MAX_CRITERIA,
  CANVAS_PIPELINE_ID,
  type CanvasCriterionKind,
  type CanvasFindingType,
} from '@sysdesign/contracts';

import type { PipelineDefinition } from '../../core/pipeline';
import { STANDARD_SCORING } from '../../core/policy';
import criticCommunication from './lenses/critic.communication.md?raw';
import criticExplanation from './lenses/critic.explanation.md?raw';
import criticFitness from './lenses/critic.fitness.md?raw';
import criticModel from './lenses/critic.model.md?raw';
import criticRequirements from './lenses/critic.requirements.md?raw';
import criticStructure from './lenses/critic.structure.md?raw';
import deriveCriteria from './lenses/derive-criteria.md?raw';
import evaluatorCoverage from './lenses/evaluator.coverage.md?raw';
import evaluatorDesign from './lenses/evaluator.design.md?raw';
import evaluatorQualities from './lenses/evaluator.qualities.md?raw';
import evaluatorReasoning from './lenses/evaluator.reasoning.md?raw';
import platform from './lenses/platform.md?raw';
import producer from './lenses/producer.md?raw';
import { REVISE_ONLY } from './controller';
import { canvasOutput, type CanvasSubmission } from './output';
import { referencesValidator, structureValidator, tracingValidator } from './validators';

/** A judge's persona closed by the one paragraph on reading a declared platform — the same words for every critic and evaluator. */
const onPlatform = (persona: string): string => `${persona.trim()}\n\n${platform.trim()}\n`;

export const SYSTEM_DESIGN_CANVAS: PipelineDefinition<CanvasSubmission> = {
  id: CANVAS_PIPELINE_ID,

  version: '2.3.0',

  // A goal another program composes; never a route, a target, or a choice in the UI.

  goalSource: 'composed',

  description:
    'A canvas drawn in the studio — nodes, edges, the brief binding each requirement to the parts that hold it, and the narrative — judged as the competencies of a senior design against the prompt it answers, and coached when asked.',

  task: {
    // The kinds are the contract's declaration (`CANVAS_CRITERION_KINDS`),
    // which a generated prompt's rubric is built from; `satisfies` keeps the
    // two from drifting while the record stays open to the engine. The
    // finding types are declared there too (`CANVAS_FINDING_TYPES`): the
    // studio words them where a lens wrote the token into a sentence.
    criterionKinds: {
      functional:
        'A capability the system must provide: a request it serves, data it ingests, a job it runs.',

      domain_model:
        'The entities the system keeps, who owns each, how they relate, the invariants and lifecycle states they hold, and the access patterns on them.',

      interface:
        'The shape of a contract the system exposes or consumes: operations, idempotency, pagination, versioning, errors, events published, polling or webhook obligations.',

      boundary:
        'Where responsibility is split and why: which part owns what, which way dependencies point, a seam, a build-or-buy choice.',

      workflow:
        'A business process carried end to end: its states, failure paths and compensations — what happens when.',

      non_functional:
        'A quality target other than load: availability, consistency, durability, freshness, security, privacy, observability or cost.',

      scale:
        'The load, volume or retention the design is sized for, proportionately to the goal’s own figures.',

      evolution:
        'How the design arrives and lives: migration from what exists, rollout and rollback, compatibility, operability, cost over time.',

      tradeoff:
        'A decision the candidate must make and justify: the alternatives, the cost accepted.',

      constraint:
        'A hard rule the design may not break: an imposed platform, a data boundary, a compliance rule, a vendor that only behaves one way.',

      communication:
        'How the components talk: each hop’s call style and mechanism, the request path traced from where it enters to where it comes to rest, and what each hop does when it fails.',
    } satisfies Record<CanvasCriterionKind, string>,
    findingTypes: {
      missing_requirement: 'A stated requirement nothing in the diagram delivers.',

      constraint_violation: 'The diagram breaks a hard rule the goal states.',

      scale_mismatch:
        'A part sized for a different load than the goal states — too little, or far too much.',

      unhandled_failure:
        'A failure the system would meet that the design does not survive or recover from.',

      data_integrity:
        'Data that can be lost, duplicated, served stale past a stated bound, or written by two owners at once.',

      topology_defect:
        'A connection, or the absence of one, that fails as drawn: an unreachable part, a client on a store, a single point on a path the goal does not forgive.',

      interface_defect:
        'A contract that cannot serve its consumer: an operation carried but never declared, declared but never exercised, owned by a part of the wrong kind, or missing the idempotency, versioning, pagination or error shape the goal’s consumers need.',

      operability_gap:
        'Nothing watches, traces, rotates, rolls out or rolls back what the goal asks to be operated — or machinery no requirement here pays for.',

      unbacked_claim:
        'A binding or narration naming a mechanism the diagram does not provide, or naming every part as if each held the requirement.',

      unexplained_component:
        'A load-bearing part no binding, rationale or responsibility accounts for, or a functional requirement no path traces.',

      contradiction:
        'Two parts of the submission that cannot both be true: a path narrated differently from the edges drawn, a claim against a config entry.',

      bad_assumption:
        'A design decision resting on something the goal does not say and would not grant.',

      model_defect:
        'An entity, owner, relationship or invariant the goal names that nothing holds, that two parts write, or that cannot reach the states the goal describes.',

      boundary_defect:
        'A responsibility in the wrong part, two parts owning one, a dependency pointing the wrong way, or a seam the goal needs and nothing draws.',

      workflow_gap:
        'A step, failure path or compensation of a stated process that nothing carries.',

      tradeoff_missing:
        'A load-bearing decision with no alternative considered, no cost accepted, or no condition to revisit it.',

      flow_gap:
        'A request the goal names that no path traces from where it enters to where it comes to rest, or a traced path that skips a part the request must pass through.',

      hop_undeclared:
        'A hop whose call style or mechanism nothing declares: sync or async says half of it; what carries the call, who initiates it and what the message is are left to be guessed.',

      failure_path_missing:
        'A hop with no answer to its own failure where the goal does not forgive it: an async hop with no retry, ordering or dead-letter story, a sync hop with no timeout or fallback.',

      integration_misfit:
        'A hop the two parts cannot make as drawn — a mechanism neither end supports, a call style the target does not answer, or, where the goal declares a platform, an integration that platform does not offer between the two services named.',

      service_misfit:
        'A component used for work it is not built for, a service named for a role other than the one the component plays, or a platform-neutral role where the goal’s declared catalogue offers a managed service for exactly that work.',

      tracing_gap:
        'A request from outside whose path shows no block or hop for a stage of its way in — name resolution, transport security, edge protection, the access layer, identity — where the goal’s scenario needs it; a traced path that ends where the request is still in flight; or a component a request reaches that no traced path lands on; and nothing says why.',

      placement_defect:
        'A block placed where the goal’s scenario does not allow it to be reached — a store or a worker in a boundary open to the outside, an entry point with nothing protecting it in its boundary — or a block with no boundary at all where the platform offers them and the scenario needs one.',
    } satisfies Record<CanvasFindingType, string>,
    maxCriteria: CANVAS_MAX_CRITERIA,
    // The transcript is the host's record of the interview — composed by the
    // studio from the turns, cited by the judges as `turn.N` — which the coach
    // reads and no model writes: a coached revision keeps the one it revises.
    carried: ['transcript'],
    output: canvasOutput,
  },

  deriveCriteria: {
    persona: deriveCriteria,
    maxTokens: 4000,
  },

  // The coach. It sees the criteria WITH their ids: a binding names a
  // criterion by id, and the author may have left one unbound — without the
  // ids the coach can only guess, and `references` refuses a guess. A coach
  // run that recalled lessons for its prompt hands them to the coach too, as
  // advice under their own heading; the lenses never see them, so a lesson
  // can shape a revision and never a grade. It still revises against the
  // remediations the panel selected, never against a score. A revision its
  // judges found no better than the best is named to it on the next ask
  // (setbacks), so it does not write the same thing again. Every cap is
  // sized from the recorded runs (the spec holds the measurements) with a
  // fifth of headroom, and each is also the call's time limit
  // (`callTimeLimitMs`), so a cap a stage outwrites is a call cut short: a
  // coached canvas has taken up to 40.2k output tokens in one turn, thinking
  // included (2026-10-02, a revision the seam now keeps whole), critics up
  // to 25.4k on a dense diagram and evaluators up to 12.0k under the lenses
  // 2.0.0 replaced — the seeds the spec holds until this version's own runs
  // are measured; the communication critic holds the same seed as its
  // siblings.
  producer: {
    persona: producer,
    maxTokens: 50000,
    // A redraw must fit one API call. Measured 2026-11-06 on a 39-block
    // canvas: the coach thought 50–125k tokens before a 15–30k-token reply,
    // crossed the per-call ceiling on every turn, and the resumed call
    // re-emitted the element it was cut in — 7 of 13 replies lost at that
    // seam, 3 more to the time limit. A fixed thinking budget was passed and
    // ignored; the effort level is the knob the CLI documents and honours.
    // Measured on the same redraw: medium thought ~45k and still crossed the
    // ceiling once (65.6k tokens, 2 calls, 573 s); low fit one call (336 s).
    effort: 'low',
    consumes: ['criteria', 'memories', 'setbacks'],
  },

  validators: [referencesValidator, structureValidator, tracingValidator],
  controller: REVISE_ONLY,

  // Each critic owns the finding types it may raise, so its reply schema
  // offers it those alone and a defect is priced where the critic's own
  // kinds earn.
  critics: [
    {
      id: 'critic.requirements',
      persona: onPlatform(criticRequirements),
      samples: 2,
      maxItems: 10,
      maxTokens: 30000,
      findingTypes: ['missing_requirement', 'constraint_violation'],
    },
    {
      id: 'critic.model',
      persona: onPlatform(criticModel),
      samples: 2,
      maxItems: 10,
      maxTokens: 32000,
      findingTypes: ['model_defect', 'interface_defect', 'data_integrity'],
    },
    {
      id: 'critic.structure',
      persona: onPlatform(criticStructure),
      samples: 2,
      maxItems: 10,
      maxTokens: 32000,
      findingTypes: ['boundary_defect', 'workflow_gap', 'topology_defect', 'placement_defect'],
    },
    {
      id: 'critic.communication',
      persona: onPlatform(criticCommunication),
      samples: 2,
      maxItems: 10,
      maxTokens: 32000,
      findingTypes: [
        'flow_gap',
        'hop_undeclared',
        'failure_path_missing',
        'integration_misfit',
        'service_misfit',
        'tracing_gap',
      ],
    },
    {
      id: 'critic.fitness',
      persona: onPlatform(criticFitness),
      samples: 2,
      maxItems: 8,
      maxTokens: 32000,
      findingTypes: ['scale_mismatch', 'unhandled_failure', 'operability_gap'],
    },
    {
      id: 'critic.explanation',
      persona: onPlatform(criticExplanation),
      samples: 2,
      maxItems: 12,
      maxTokens: 32000,
      findingTypes: [
        'unbacked_claim',
        'contradiction',
        'unexplained_component',
        'bad_assumption',
        'tradeoff_missing',
      ],
    },
  ],

  // An evaluator with no criteria of its kinds on a prompt is skipped
  // without a call, so a prompt pays only for the competencies it asks for.
  evaluators: [
    {
      id: 'evaluator.coverage',
      persona: onPlatform(evaluatorCoverage),
      samples: 2,
      consumes: ['findings'],
      maxTokens: 12200,
      criterionKinds: ['functional', 'constraint'],
    },
    {
      id: 'evaluator.design',
      persona: onPlatform(evaluatorDesign),
      samples: 2,
      consumes: ['findings'],
      maxTokens: 16000,
      criterionKinds: ['domain_model', 'interface', 'boundary', 'workflow', 'communication'],
    },
    {
      id: 'evaluator.qualities',
      persona: onPlatform(evaluatorQualities),
      samples: 2,
      consumes: ['findings'],
      maxTokens: 16000,
      criterionKinds: ['non_functional', 'scale', 'evolution'],
    },
    {
      id: 'evaluator.reasoning',
      persona: onPlatform(evaluatorReasoning),
      samples: 2,
      consumes: ['findings'],
      maxTokens: 12200,
      criterionKinds: ['tradeoff'],
    },
  ],

  policy: {
    version: '2',

    // Reasoning carries a quarter: the owner's call (2026-10-20) that
    // defending each decision against the alternatives is a large part of
    // what a senior design is, graded through the three standing criteria
    // every rubric carries and the trade-off rows a prompt poses.
    dimensionWeights: {
      coverage: 0.2,

      design: 0.3,

      qualities: 0.15,

      reasoning: 0.25,

      compliance: 0.1,
    },

    // Every kind weighs the same within its dimension: the deriver and the
    // draft consolidate a prompt's figures into one or two scale criteria,
    // so scale no longer needs the half weight that several figure rows once
    // justified.
    criterionKinds: {
      functional: { dimension: 'coverage', weight: 1, gate: false },
      domain_model: { dimension: 'design', weight: 1, gate: false },
      interface: { dimension: 'design', weight: 1, gate: false },
      boundary: { dimension: 'design', weight: 1, gate: false },
      workflow: { dimension: 'design', weight: 1, gate: false },
      non_functional: { dimension: 'qualities', weight: 1, gate: false },
      scale: { dimension: 'qualities', weight: 1, gate: false },
      evolution: { dimension: 'qualities', weight: 1, gate: false },
      tradeoff: { dimension: 'reasoning', weight: 1, gate: false },
      constraint: { dimension: 'compliance', weight: 1, gate: true },
      communication: { dimension: 'design', weight: 1, gate: false },
    } satisfies Record<CanvasCriterionKind, { dimension: string; weight: number; gate: boolean }>,

    // A type prices onto the dimension its owning critic's kinds earn.
    findingTypes: {
      missing_requirement: { dimension: 'coverage', gate: false },
      constraint_violation: { dimension: 'compliance', gate: true },
      scale_mismatch: { dimension: 'qualities', gate: false },
      unhandled_failure: { dimension: 'qualities', gate: false },
      data_integrity: { dimension: 'design', gate: false },
      topology_defect: { dimension: 'design', gate: false },
      interface_defect: { dimension: 'design', gate: false },
      operability_gap: { dimension: 'qualities', gate: false },
      unbacked_claim: { dimension: 'reasoning', gate: false },
      unexplained_component: { dimension: 'reasoning', gate: false },
      contradiction: { dimension: 'reasoning', gate: false },
      bad_assumption: { dimension: 'reasoning', gate: false },
      model_defect: { dimension: 'design', gate: false },
      boundary_defect: { dimension: 'design', gate: false },
      workflow_gap: { dimension: 'design', gate: false },
      tradeoff_missing: { dimension: 'reasoning', gate: false },
      flow_gap: { dimension: 'design', gate: false },
      hop_undeclared: { dimension: 'design', gate: false },
      failure_path_missing: { dimension: 'design', gate: false },
      integration_misfit: { dimension: 'design', gate: false },
      service_misfit: { dimension: 'design', gate: false },
      tracing_gap: { dimension: 'design', gate: false },
      placement_defect: { dimension: 'design', gate: false },
    } satisfies Record<CanvasFindingType, { dimension: string; gate: boolean }>,

    ...STANDARD_SCORING,

    // Two samples on every lens and two hits to confirm: a constraint
    // violation gates, and one sample must never be able to block a run.
    evidence: { minHits: 2, minAssessedShare: 0.75 },

    thresholds: { acceptAt: 75, rejectBelow: 30 },

    loop: { maxIterations: 3, plateauAfter: 2, concurrency: 3, lostProduces: 1 },
  },
};
