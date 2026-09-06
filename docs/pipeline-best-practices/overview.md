In general, your critic-eval model abstracts to any AI workflow as a quality-control loop:

producer creates artifact
→ critics find defects
→ evaluators measure quality against criteria
→ controller decides accept / revise / retry / escalate / reject
→ system stores trace + lessons

This is not specific to beam search. Beam search just makes it more complex because you have multiple CandidatePlans competing.

The general pattern is:

Generator / Worker:
creates candidate output

Critic:
identifies weaknesses, risks, missing requirements, contradictions, bad assumptions

Evaluator:
judges how well the output satisfies defined criteria

Controller:
makes the final decision using deterministic rules, thresholds, policies, and traces

1. Generic abstraction

For any workflow, you can model it like this:

type WorkflowArtifact = {
id: string;
type: "answer" | "plan" | "code" | "browser_trace" | "extraction" | "summary" | "tool_result";
inputGoal: string;
output: unknown;
trace?: unknown;
metadata: Record<string, unknown>;
};

type CritiqueReport = {
artifactId: string;
findings: CriticFinding[];
confidence: number;
rationale: string;
};

type EvaluationReport = {
artifactId: string;
rubricLens: string;
evidence: EvaluationEvidence[];
advisoryVerdict?: "accept" | "revise" | "retry" | "escalate" | "reject";
confidence: number;
rationale: string;
};

type ControllerDecision = {
artifactId: string;
decision: "accept" | "revise" | "retry" | "route" | "escalate" | "reject";
selectedFixes?: string[];
scoreTrace: FactorTrace[];
reason: string;
};

In your beam engine, WorkflowArtifact = CandidatePlan.
In a RAG system, WorkflowArtifact = answer + retrieved context.
In a code agent, WorkflowArtifact = patch + test result.
In browser automation, WorkflowArtifact = browser state + action trace.

2. Critic vs evaluator in the generic model

The critic is defect-oriented.

“What is wrong, missing, risky, unsupported, inconsistent, or likely to fail?”

The evaluator is criteria-oriented.

“How well does this artifact satisfy the rubric, goal, user intent, and constraints?”

The controller is decision-oriented.

“What should the system do next?”

This separation matters because LLM judges are useful, but they are not perfectly deterministic. Modern evaluation platforms distinguish between evaluator types such as LLM-as-judge, code evaluators, composite evaluators, summary evaluators, pairwise comparisons, offline datasets, and online production evaluation. LangSmith’s docs explicitly describe evaluation across the application lifecycle, including offline dataset testing and online monitoring of production traces.

3. General pipeline

A clean critic-eval pipeline looks like this:

1. Define task contract
   - goal
   - success criteria
   - constraints
   - expected output schema
   - unacceptable failure modes

2. Generate artifact
   - answer
   - plan
   - code
   - action trace
   - extracted data
   - workflow result

3. Run deterministic validators
   - schema valid?
   - required fields present?
   - citations present?
   - code compiles?
   - tests pass?
   - policy constraints satisfied?
   - tool outputs valid?

4. Run critics
   - find defects
   - identify missing requirements
   - locate unsupported claims
   - flag risk
   - suggest repair type

5. Run evaluators
   - score or produce evidence by rubric lens
   - compare against reference, rubric, policy, or trace
   - identify quality level

6. Controller decides
   - accept
   - revise
   - retry
   - call another tool
   - route to specialist strategy
   - escalate to human
   - reject

7. Store trace
   - input
   - output
   - critiques
   - evals
   - decision
   - outcome
   - lessons

This matches industry practice: evals are not just final answer grading; they become a lifecycle measurement layer for development, regression testing, deployment gates, and production monitoring. OpenAI describes evals as methods to measure and improve whether an AI system meets expectations, while NIST’s AI RMF emphasizes measurable, documented test/evaluation/verification/validation processes and continuous measurement as systems and risks evolve.

4. Best-practice architecture

Use this architecture:

LLM worker
→ deterministic validation
→ critic ensemble
→ evaluator ensemble
→ evidence normalizer
→ deterministic decision policy
→ retry/revise/accept/escalate
→ trace store
→ regression dataset / memory

The important industry-style rule:

Do not let the evaluator directly control production behavior.

Let evaluators produce evidence.
Let deterministic policy make the decision.

That gives you auditability, reproducibility, and safer deployments.

5. Critic types that generalize well

These critic personalities work across most AI workflows:

type GenericCritic =
| "requirements_critic"
| "correctness_critic"
| "grounding_critic"
| "consistency_critic"
| "safety_policy_critic"
| "tool_use_critic"
| "dataflow_critic"
| "edge_case_critic"
| "risk_critic"
| "format_schema_critic"
| "user_intent_critic"
| "regression_critic";

Examples:

Critic Looks for
requirements_critic Missing success criteria
correctness_critic Wrong reasoning, wrong answer, bad assumptions
grounding_critic Unsupported claims, hallucinations, missing citations
consistency_critic Internal contradictions
safety_policy_critic Unsafe or disallowed behavior
tool_use_critic Bad tool calls, missing tool calls, invalid tool outputs
dataflow_critic Missing inputs/outputs, broken dependencies
edge_case_critic Unhandled cases
risk_critic Failure modes and mitigation gaps
format_schema_critic Invalid output structure
user_intent_critic Solves wrong problem
regression_critic Worse than prior known-good behavior

For your engine, these map directly to IntentTree critics.

For a RAG app, they map to hallucination, relevance, retrieval quality, and citation checks.

For codegen, they map to compile/test/security/API-contract checks.

6. Evaluator types that generalize well

Evaluators should be rubric lenses:

type GenericEvaluator =
| "correctness"
| "completeness"
| "faithfulness_grounding"
| "relevance"
| "instruction_following"
| "format_compliance"
| "safety"
| "helpfulness"
| "efficiency"
| "robustness"
| "user_satisfaction"
| "task_success";

For RAG specifically, common metrics include faithfulness/groundedness, answer relevancy, context precision, and context recall; RAGAS was designed around evaluating retrieval plus generation quality rather than only final text quality.

For general LLM apps, use a mix of:

deterministic evaluators:
schema validation, exact match, unit tests, compilers, static analysis

reference-based evaluators:
compare to expected answer / golden output

reference-free evaluators:
LLM judge evaluates rubric without perfect ground truth

pairwise evaluators:
compare candidate A vs candidate B

human evaluators:
expert or user annotation

online evaluators:
monitor live production traces

This aligns with modern eval tooling practice: LangSmith, for example, describes LLM-as-judge, code, composite, summary, pairwise, offline, and online evaluation modes.

7. Best companies treat evals as product infrastructure

The best AI teams do not treat evals as a one-off prompt test. They treat evals as infrastructure.

Good pattern:

Every meaningful change gets evaluated:
model change
prompt change
tool change
retrieval change
strategy change
policy change
workflow change

Strong teams use:

offline evals before deployment
online evals after deployment
red-team/adversarial evals
golden datasets
production trace sampling
human review queues
regression gates in CI
system cards / release notes
risk scorecards

OpenAI’s public system cards and safety materials repeatedly describe predeployment safety evaluations, red teaming, and Preparedness Framework evaluations; OpenAI also describes third-party evaluation standards emphasizing clarity about what was tested, how results were elicited, and how validity was checked.

NIST’s AI RMF gives the broader governance framing: evaluate risks through Govern, Map, Measure, and Manage functions, and maintain documented, repeatable TEVV processes.

8. Best-practice design rules
   Rule 1: Separate generation, critique, evaluation, and control

Bad:

LLM generates answer and says “this is correct.”

Better:

LLM generates answer.
Separate critic finds defects.
Separate evaluator judges quality.
Controller decides accept/retry.

Best:

LLM generates answer.
Deterministic validators run first.
Critic/evaluator artifacts are schema-bound.
Controller computes decision using transparent thresholds and traces.
Rule 2: Use structured artifacts, not free-form judgments

Bad:

“The answer seems mostly good.”

Good:

type EvaluationEvidence = {
criterionId: string;
result: "pass" | "partial" | "fail";
evidenceRefs: string[];
rationale: string;
confidence: number;
};

Your current instinct — strict JSON schemas — is correct.

Rule 3: Use multiple evaluators, not one generic judge

A single evaluator saying “quality = 8/10” is weak.

Better:

correctness evaluator
grounding evaluator
safety evaluator
format evaluator
completeness evaluator
tool-use evaluator

Then aggregate deterministically.

finalQuality =
0.30 * correctness +
0.20 * completeness +
0.20 * grounding +
0.15 * safety +
0.10 * instructionFollowing +
0.05 * formatCompliance;

For high-risk workflows, safety/constraint gates should be hard blockers, not just weighted factors.

Rule 4: Mix deterministic checks with LLM judges

LLM judges are useful for semantic quality, but they are noisy.

Use deterministic checks wherever possible:

JSON schema validation
type validation
unit tests
integration tests
compiler checks
linting
citation existence
retrieval source coverage
policy checks
tool result validation
browser state assertions
database constraints

Use LLM judges for:

semantic correctness
helpfulness
ambiguity resolution
coverage interpretation
style/tone
risk reasoning
unsupported-claim detection

Do not use LLM judges where exact validators exist.

Rule 5: Evaluate traces, not only final outputs

For agentic workflows, final answer eval is not enough.

You need to evaluate:

input interpretation
tool selection
intermediate reasoning artifacts
retrieved context
browser actions
API calls
patches
verification results
final output

LangSmith emphasizes traces and production monitoring because agent/workflow quality depends on intermediate behavior, not just the final message.

For your engine, that means evaluating:

ObjectiveSpec
CandidatePlan
IntentTree
critic findings
evaluator evidence
selected action
patch
verification result
compiled plan
Rule 6: Build eval datasets from real failures

The most valuable evals come from observed failures.

Dataset buckets:

golden success cases
known bug regressions
edge cases
adversarial cases
production failures
ambiguous user requests
tool-failure cases
policy boundary cases
long-horizon agent cases

HELM is a good example of standardized, transparent evaluation across scenarios, metrics, and models, with an emphasis on reporting prompts/completions and treating evaluation as broader than a single benchmark.

For your workflow engine, every failed run should be convertible into:

regression fixture
critic test case
evaluator calibration case
strategy selection test
op reliability test 9. Recommended generic artifact contracts
Critic report
type CriticReport = {
schemaVersion: string;
artifactId: string;
criticType: string;

findings: {
id: string;
type: string;
severity: "low" | "medium" | "high" | "fatal";
locationRefs: string[];
evidenceRefs: string[];
fixability:
| "fixable_local"
| "requires_retry"
| "requires_tool"
| "requires_user"
| "requires_backtrack"
| "unfixable";
suggestedFixType:
| "revise"
| "repair"
| "rerun"
| "retrieve_more_context"
| "call_tool"
| "escalate"
| "reject";
confidence: number;
rationale: string;
}[];

confidence: number;
rationale: string;
};
Evaluation report
type EvaluationReport = {
schemaVersion: string;
artifactId: string;
evaluatorLens: string;

criteriaResults: {
criterionId: string;
result: "pass" | "partial" | "fail" | "not_applicable";
evidenceRefs: string[];
confidence: number;
rationale: string;
}[];

qualityEvidence: {
type: string;
polarity: "positive" | "negative" | "mixed";
evidenceRefs: string[];
confidence: number;
rationale: string;
}[];

advisoryVerdict?: "accept" | "revise" | "retry" | "escalate" | "reject";
confidence: number;
rationale: string;
};
Controller decision
type QualityControlDecision = {
artifactId: string;

finalDecision:
| "accept"
| "revise"
| "retry"
| "route_to_specialist"
| "ask_user"
| "escalate_human"
| "reject";

scores: {
correctness: number;
completeness: number;
grounding: number;
safety: number;
format: number;
taskSuccess: number;
overall: number;
};

gates: {
schemaValid: boolean;
policyAllowed: boolean;
evidenceSufficient: boolean;
toolResultsValid: boolean;
humanReviewRequired: boolean;
};

selectedRemediations: {
findingId: string;
action: string;
targetRefs: string[];
}[];

trace: FactorTrace[];
}; 10. How this maps to common AI products
RAG answer system
Generator:
produces answer from retrieved chunks

Critic:
finds unsupported claims, missing citations, irrelevant chunks

Evaluator:
grades faithfulness, answer relevance, context precision/recall

Controller:
accept, retrieve more, rewrite with citations, or refuse
Code generation agent
Generator:
writes patch

Critic:
finds suspicious logic, missing tests, API misuse, security risk

Evaluator:
runs tests, typecheck, style, correctness rubric

Controller:
accept patch, request repair, run additional tests, or revert
Browser automation agent
Generator:
chooses browser action

Critic:
detects stuck state, unsafe submit, login wall, hidden modal

Evaluator:
judges progress toward task completion

Controller:
continue, screenshot-reason, backtrack, ask user, or stop
Customer support bot
Generator:
drafts response

Critic:
finds policy violations, missing empathy, wrong account claim

Evaluator:
grades helpfulness, correctness, policy compliance, tone

Controller:
send, revise, escalate to human
Your beam planner
Generator:
creates CandidatePlan / patch

Critic:
finds IntentTree weaknesses

Evaluator:
judges ObjectiveSpec coverage and future gain

Controller:
computes score, action, target, prune/keep

Same pattern.

11. LLM-as-judge best practices

When using LLM judges:

1. Give a precise rubric.
2. Use structured output.
3. Ask for evidence references.
4. Hide irrelevant metadata.
5. Avoid showing previous scores.
6. Use pairwise comparison when absolute scoring is unstable.
7. Calibrate against human labels.
8. Track judge drift when model versions change.
9. Run multiple samples for high-stakes decisions.
10. Use deterministic validators before LLM judges.

Important: LLM judge outputs can vary. Evidently’s LLM-as-judge docs explicitly note that judge results vary because LLMs are non-deterministic, which is why the judge should be part of a broader framework rather than the sole authority.

12. Production best practices

For production-grade critic/eval workflows, implement:

offline eval suite:
predeployment regression testing

online eval monitors:
production trace sampling

human review:
high-risk / low-confidence cases

red-team evals:
adversarial prompts and failure modes

golden datasets:
expected behavior

canary deployment:
compare old vs new prompt/model/strategy

eval dashboards:
quality, safety, cost, latency, regression rate

incident loop:
production failures become regression cases

OpenAI’s public safety and system-card process emphasizes predeployment evals, red teaming, external testing, and risk-specific scorecards; that is the mature pattern to copy conceptually for serious agent workflows.

13. The best abstraction for your system

For your project, generalize from CandidatePlan to ArtifactUnderEvaluation.

type ArtifactUnderEvaluation =
| CandidatePlan
| GeneratedAnswer
| CodePatch
| BrowserTrace
| ExtractedData
| StrategyPlan
| ToolCallResult;

Then use the same quality loop:

ArtifactUnderEvaluation
→ deterministic validators
→ critics
→ evaluators
→ normalized evidence
→ decision policy
→ remediation
→ trace/memory

That makes your critic/eval framework reusable outside beam search.

14. Final best-practice rule set

Use this as your design doctrine:

Critics diagnose.
Evaluators measure.
Validators verify.
Controllers decide.
Memory learns.
Humans handle high-risk ambiguity.

And the strongest architecture rule:

LLMs may produce evidence and recommendations.
The system owns validation, thresholds, routing, final decisions, and state transitions.

That is the general pattern used by serious AI systems: evals are structured, traceable, versioned, calibrated, monitored, and connected to deployment gates rather than treated as a loose “does this look good?” prompt.
