regarding pipeline "producer creates artifact → critics find defects → evaluators measure quality against criteria → controller decides accept / revise / retry / escalate / reject → system stores trace + lessons" does each step take prior input of step before or do critics and evaluators run in parallel for example and take only producer artifact as input? How does data dependency work for each step of the critic-eval abstract pipeline

Some earlier uploaded files expired on my side, so I’m answering at the architecture level. For exact repo mapping, reupload the current schema/code.

The abstract pipeline is not strictly linear at every internal step. It is better modeled as a dataflow DAG:

Producer artifact
├── deterministic validators
├── critics
└── direct evaluators
↓
normalized evidence bundle
↓
dependent evaluators / aggregate evaluators
↓
controller decision
↓
trace + lessons

The clean answer:

Critics and evaluators can run in parallel only when they do not depend on each other.

But the strongest evaluator outputs usually depend on critic findings, validator results, and the original artifact.

1. Minimal dependency model
   Input request / goal
   ↓
   Producer creates artifact
   ↓
   ArtifactContext
   ↓
   Validators + Critics + Some Evaluators
   ↓
   EvidenceBundle
   ↓
   Controller
   ↓
   Decision + Trace

Every downstream step should receive the original artifact, not just the previous step’s output.

Bad:

producer → critic → evaluator

where evaluator only sees critic output.

Good:

evaluator receives:
original goal
produced artifact
validator results
critic findings
prior traces when relevant

Because critic findings are only one evidence source.

2. What each step depends on
   Step Required input Optional input Output
   Producer goal, context, constraints, tools prior lessons, strategy hints artifact
   Validators artifact, schemas, policies, tool contracts registry/dataflow metadata validation results
   Critics goal, artifact, trace, validator results prior failures, domain rules defect findings
   Evaluators goal, artifact, rubric, validator results critic findings, reference answer, prior baselines quality evidence
   Controller artifact, validator results, critic reports, eval reports, policy thresholds memory priors, budget state accept/revise/retry/escalate/reject
   Learning full trace, final outcome human feedback, production outcome reusable lessons/stats
3. Which parts can run in parallel?
   Can run in parallel

These can usually run immediately after producer artifact exists:

schema validator
policy validator
format validator
grounding critic
requirements critic
safety critic
correctness evaluator
format evaluator
basic completeness evaluator

They all consume:

goal + artifact + rubric/contracts

They do not necessarily need each other.

Example:

Artifact produced
├── schema check
├── safety critic
├── grounding critic
├── completeness evaluator
└── format evaluator
Should usually run after critics

Some evaluators are better if they consume critic findings:

future-gain evaluator
repairability evaluator
terminal-readiness evaluator
risk-control evaluator
revision-priority evaluator

Because they need to know:

what defects exist
how severe they are
whether they are fixable
which criteria they block
whether they repeat from prior attempts

Example:

Critic finds:
missing evidence
unsupported claim
schema invalidity

Then evaluator says:
grounding = weak
terminal readiness = low
revision potential = high 4. Best-practice structure: two evaluator tiers

Use two evaluator tiers.

Tier 1: direct evaluators
consume goal + artifact + rubric

Tier 2: evidence-conditioned evaluators
consume goal + artifact + validators + critics + tier-1 evals

Example:

Producer artifact
↓
Tier 1:

- format evaluator
- instruction-following evaluator
- basic correctness evaluator
- basic completeness evaluator

Critics:

- grounding critic
- risk critic
- missing-requirements critic
- tool-use critic

EvidenceBundle
↓
Tier 2:

- future-gain evaluator
- terminal-readiness evaluator
- repairability evaluator
- final-quality aggregator

This avoids forcing everything into one sequential chain.

5. Recommended dataflow shape
   type ProducedArtifact = {
   artifactId: string;
   goalId: string;
   artifactType: string;
   content: unknown;
   traceRefs: string[];
   metadata: Record<string, unknown>;
   };

type ValidationResult = {
artifactId: string;
validatorType: string;
passed: boolean;
issues: ValidationIssue[];
};

type CritiqueReport = {
artifactId: string;
criticType: string;
findings: CriticFinding[];
};

type EvaluationReport = {
artifactId: string;
evaluatorLens: string;
criteriaEvidence: EvaluationEvidence[];
advisoryVerdict?: "accept" | "revise" | "retry" | "escalate" | "reject";
};

type EvidenceBundle = {
artifactId: string;
validations: ValidationResult[];
critiques: CritiqueReport[];
evaluations: EvaluationReport[];
normalizedIssues: NormalizedIssue[];
};

Then the controller consumes only the normalized bundle:

type ControllerInput = {
goal: ObjectiveSpec;
artifact: ProducedArtifact;
evidenceBundle: EvidenceBundle;
policy: DecisionPolicy;
budget: BudgetState;
history: AttemptHistory;
}; 6. The most correct abstract pipeline

Instead of this:

producer → critics → evaluators → controller

Use this:

producer creates artifact
↓
assessment fan-out:
validators + critics + direct evaluators
↓
evidence normalization
↓
dependent evaluators / aggregate evaluators
↓
controller decision
↓
trace + learning

So the pipeline is partially ordered, not fully sequential.

7. Dependency rules

Use these rules:

Validators should run as early as possible.
Critics should see validator results when relevant.
Evaluators should see critic findings when judging repairability, risk, terminal readiness, or future gain.
Controller should see everything.
Learning should see the complete trace and final outcome.

More specific:

schema/format eval:
does not need critics

correctness eval:
may run without critics, but improves with critic findings

risk eval:
should consume risk critic findings

future-gain eval:
should consume all critic findings + history

terminal-readiness eval:
must consume validators + blocking critic findings

controller:
must consume normalized validators + critics + evaluators 8. Example: generated answer workflow
User asks question
↓
Producer generates answer
↓
Parallel:

- schema/format validator
- citation validator
- grounding critic
- missing-requirements critic
- direct helpfulness evaluator
- direct instruction-following evaluator
  ↓
  EvidenceBundle
  ↓
  Dependent evaluators:
- answer-readiness evaluator
- revision-value evaluator
  ↓
  Controller:
  accept or revise

The evaluator should not only depend on critic output. It should receive:

original user request
generated answer
retrieved sources/tool outputs
critic findings
validator results
rubric 9. Example: your CandidatePlan workflow

For your engine:

CandidatePlan produced/refined
↓
Parallel deterministic checks:

- IntentTree schema validation
- registry validation
- dataflow validation
- policy validation
- compile-readiness scan
  ↓
  Critics:
- coverage critic
- structure critic
- hole critic
- choice critic
- registry critic
- risk critic
  ↓
  EvidenceBundle
  ↓
  Evaluators:
- completeness evaluator
- feasibility evaluator
- verifiability evaluator
- future-gain evaluator
- terminal-readiness evaluator
  ↓
  Engine controller:
  refine / repair / expand-k / backtrack / hold / prune / terminate

Some evaluators can run earlier, but these should consume critics:

future-gain evaluator
terminal-readiness evaluator
repairability evaluator 10. Best final design rule

Use this doctrine:

Every step should receive the original artifact plus all upstream evidence it semantically depends on.

Do not force strict chaining unless the downstream judgment truly needs the prior result.

So:

Critics do not always need evaluator output.
Evaluators do not always need critic output.
But final evaluators and the controller should consume normalized critic evidence.

The clean abstraction:

Producer creates the candidate.
Validators prove hard facts.
Critics find defects.
Evaluators interpret quality.
Controller makes the decision.
Learning stores the trace.

And the dependency graph should be:

artifact is the root input to all assessment steps;
evidence bundle is the root input to final decision steps.
