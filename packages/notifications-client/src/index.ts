/**
 * @sysdesign/notifications-client — the notifications bus as one port, its
 * HTTP adapter, the errors both raise, and how a program asks a person
 * through it and waits for the answer as an event.
 */
export { BusClient } from './bus-client';
export {
  BusCallAborted,
  BusRefused,
  BusTimeout,
  BusUnreachable,
  PromptExpired,
  SubscriptionMissing,
} from './bus-errors';
export { HttpBusClient, type BusRecovery, type HttpBusOptions } from './http-bus-client';
export { InteractionClient, type InteractionOptions, type Withdrawal } from './interaction-client';
