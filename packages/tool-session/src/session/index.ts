// A mission run as tool calls the loop decides: the ports a session is run
// with, the registry that runs them, the adapters onto the bus, and what the
// operator is asked.
export { BusSessionEvents, InteractionOperator } from './bus-adapters';
export { summaryPrompt } from './operator-prompts';
export type { Clock, OperatorPort, SessionDeps, SessionEventsPort, SessionLog } from './ports';
export { SessionRegistry } from './registry';
