import type { Criterion } from './criterion';

/** The mailbox service (packages/gmail). */
export const GMAIL_CRITERIA: readonly Criterion[] = [
  {
    id: 'GML-1',
    statement:
      'The mailbox service says what it saw and did on the bus under its own source — a message newly arrived in the inbox, a draft written, labels changed — through topics declared once in the contracts with strict payloads, and never a message sent: it has no tool that sends.',
  },
  {
    id: 'GML-2',
    statement:
      'The service’s configuration is one declared module: its port, the loop, the bus and each peer the settings name read from the environment there alone, a bad value or a peer no variable locates refused by name; and its settings are files under its own config/ — the session, the watcher, the peers and the mailbox — each kind chosen by name and refused when unchosen.',
  },
  {
    id: 'GML-3',
    statement:
      'A message’s text is its plain part, else its HTML part reduced to what a person reads; a snippet, which Gmail writes HTML-escaped, is decoded with the characters that draw nothing removed; addresses are read off a header as it lists them; a draft is one RFC 822 message base64url-encoded, a reply threading itself under the message it answers by In-Reply-To and References, its subject prefixed once, a subject beyond ASCII encoded as RFC 2047 says, and no header value carrying a line break.',
  },
  {
    id: 'GML-4',
    statement:
      'The Gmail REST adapter fills the mailbox port call by call — a thread search listing each thread from its messages’ headers, a message or a thread read whole, a draft created in its thread with the original’s recipients and subject by default, drafts and labels listed, labels put on or taken off by name through the ids the list gives and an unknown name refused, the profile, and the inbox’s history walked page by page with a stale id read as none — every call authorized and every answer read by its schema.',
  },
  {
    id: 'GML-5',
    statement:
      'The ten tools are declared once over the mailbox port with their parameters as schemas: three reads, a draft that is never sent, a drafts list, a labels list and four label changes, none asking the operator first, each answering in words a plan reads with the ids a later call takes, a missing message or thread and an unknown label read as refusals, and a draft or a label change said on the bus.',
  },
  {
    id: 'GML-6',
    statement:
      'The inbox watcher starts from where the mailbox stands when the service starts and tells nothing older; each poll reads the history since its cursor, says each arrival that the account did not send itself on the bus, tells a person of the poll’s arrivals in one notice, moves the cursor, and on a history the mailbox will not answer from starts again from now; the watcher is off by a setting.',
  },
  {
    id: 'GML-7',
    statement:
      'The service composes the mailbox behind its port, the tools over it, the sessions the loop decides for them and the watcher, serves health, sessions and tools over HTTP, and runs one mission or the consent from its command line — a configuration problem exiting 2 by name.',
  },
];
