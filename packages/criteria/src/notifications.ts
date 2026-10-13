import type { Criterion } from './criterion';

/**
 * Notifications: the bus service (packages/notifications) and its client
 * (packages/notifications-client).
 */
export const NOTIFICATIONS_CRITERIA: readonly Criterion[] = [
  // Notifications (packages/notifications)
  {
    id: 'NTF-1',
    statement:
      'The bus accepts an event only on a declared topic, with a payload that topic’s schema accepts, from a publisher the topic allows — an answer to a prompt only from the service itself — and commits events in sequence order, so a cursor never passes an event still being written.',
  },
  {
    id: 'NTF-2',
    statement:
      'A subscription is a named cursor, created at the head and replaced idempotently by name; a pull returns what lies past it oldest first or waits for it, woken by a publish with no wakeup lost and released on shutdown or when its client leaves; an acknowledgement only moves the cursor forward, so delivery is at least once.',
  },
  {
    id: 'NTF-3',
    statement:
      'The bus forgets an event only once it is older than the declared retention and behind every subscription’s cursor, keeps its newest event so its head never moves back, removes subscriptions idle past the declared age, and a sweep never throws, never runs beside the one before it, and is let finish before the store closes.',
  },
  {
    id: 'NTF-4',
    statement:
      'A prompt is opened once and delivered once per channel however often its event is replayed or the service restarts; a channel that fails is retried within declared bounds and then passed over, never holding back the events behind it.',
  },
  {
    id: 'NTF-5',
    statement:
      'Every channel reads a reply the one declared way — a command by its slash, a choice by its key or by its label as the list spells it, the person’s own words within their length — and refuses anything else saying how the prompt is answered; a reply resolves to the prompt it replies to, else to the one prompt open on its address; one accepted reply publishes one answer, a reply to a closed prompt is refused politely, and a replayed one is ignored.',
  },
  {
    id: 'NTF-6',
    statement:
      'An answer, a withdrawal or an expiry closes a prompt on every channel it reached, idempotently; a withdrawal after an answer marks that answer unused; a prompt past its time is withdrawn by the service itself.',
  },
  {
    id: 'NTF-7',
    statement:
      'The Telegram channel serves only the chat its environment names — answering /start with the chat id to name while none is, and delivering nothing then — hands the service what that chat types or presses exactly as typed, confirms each update only once handled, answers every button press, waits out a rate limit within its cap and a second poller with a backoff, takes an edit Telegram refuses as done, refuses to start on a rejected token, and never writes its token into a log or an error.',
  },
  {
    id: 'NTF-8',
    statement:
      'A prompt renders on Telegram as escaped HTML — its title, who asks, its details, its choices lettered a…z then aa… with their notes, and how it is answered — in as few parts as fit a message with room kept for its outcome, nothing cut inside a tag or an entity, a button per letter up to the declared count and per command under the last part, each sending exactly what typing it would within 64 bytes.',
  },
  {
    id: 'NTF-9',
    statement:
      'Every variable the service reads is declared once — its own and each chosen channel’s — and every setting is a file chosen by name; a chosen channel missing a variable it requires refuses boot naming it, and nothing else in the package reads the environment.',
  },
  {
    id: 'NTF-10',
    statement:
      'The service is layered bus, interactions, channels, each folder reaching another only through its declared door; a channel is a folder plus one registration line, and no other file names it.',
  },
  // Notifications client (packages/notifications-client)
  {
    id: 'NTC-1',
    statement:
      'The bus client makes each call on its route and unwraps the envelope; it names a missing subscription as such, a refusal with the service’s own words, a call that never reached the service, one that timed out past a pull’s own wait, and one its caller abandoned — and asks again, within the declared recovery window, a call that never reached a restarting service and a pull the service did not answer in time — the one call it makes that a repeat cannot double.',
  },
  {
    id: 'NTC-2',
    statement:
      'Asking a person through the bus subscribes before it publishes the prompt, passes over every other prompt’s answer, returns its own and unsubscribes; a prompt the service expires ends the ask as expired, and an abort withdraws the prompt with the reason it carries, or as abandoned when it carries none.',
  },
];
