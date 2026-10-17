/**
 * The memory strategy as this pipeline reads and prints it. The schema is the
 * contract's (`memoryStrategySchema`) — the agentic-memory runtime executes the
 * same strategy, so neither owns it alone; what is the pipeline's is where a
 * judge finds each part. `locate` names the places — the summary and each
 * numbered assumption, register, interface, workflow, safeguard, trade-off and
 * risk — and `render` opens every line with that place's `[id]`, so a finding
 * cites a location the rendered text actually prints.
 */
import { memoryStrategySchema, type MemoryStrategy } from '@sysdesign/contracts';

import { numbered, numberedSection, type OutputShape } from '../../core/contracts';

export const memoryStrategyOutput: OutputShape<MemoryStrategy> = {
  schema: memoryStrategySchema,

  locate: (strategy) => [
    { id: 'summary', label: 'Summary' },
    ...numbered('assumption', strategy.assumptions, (item) => item),
    ...numbered(
      'register',
      strategy.registers,
      (item) => `${item.name} — ${item.kind}/${item.term}`,
    ),
    ...numbered('interface', strategy.interfaces, (item) => `${item.operation}(${item.register})`),
    ...numbered('workflow', strategy.workflows, (item) => item.name),
    ...numbered('safeguard', strategy.safeguards, (item) => item.rule),
    ...numbered('tradeoff', strategy.tradeoffs, (item) => item.decision),
    ...numbered('risk', strategy.risks, (item) => item.risk),
  ],

  render: (strategy) =>
    [
      `[summary] ${strategy.summary}`,
      ...numberedSection('Assumptions', 'assumption', strategy.assumptions, (item) => item),
      ...numberedSection(
        'Registers',
        'register',
        strategy.registers,
        (item) =>
          `${item.name} [${item.kind}/${item.term}] — holds: ${item.holds} | store: ${item.store} | scope: ${item.scope} | metadata: ${item.metadata.join(', ')} | lifecycle: ${item.lifecycle}`,
      ),
      ...numberedSection(
        'Interfaces',
        'interface',
        strategy.interfaces,
        (item) =>
          `${item.operation}(${item.register}): ${item.input} -> ${item.output} | guarantee: ${item.guarantee}`,
      ),
      ...numberedSection(
        'Workflows',
        'workflow',
        strategy.workflows,
        (item) =>
          `${item.name} [${item.kind}]: ${item.steps.map((step) => `${step.operation}:${step.register} — ${step.does}`).join(' → ')}`,
      ),
      ...numberedSection(
        'Safeguards',
        'safeguard',
        strategy.safeguards,
        (item) => `${item.rule} — ${item.mechanism}`,
      ),
      ...numberedSection(
        'Trade-offs',
        'tradeoff',
        strategy.tradeoffs,
        (item) =>
          `${item.decision} — ${item.rationale}${item.alternative ? ` (alternative: ${item.alternative})` : ''}`,
      ),
      ...numberedSection(
        'Risks',
        'risk',
        strategy.risks,
        (item) => `${item.risk} — mitigation: ${item.mitigation}`,
      ),
    ].join('\n'),
};
