// The mailbox: the port the tools and the watcher reach it by, and its Gmail REST filling.
export { GMAIL_API, GmailRest } from './gmail-rest/client';
export {
  LabelUnknown,
  MAILBOX,
  type DraftRequest,
  type DraftSummary,
  type HistoryPage,
  type Label,
  type MailboxPort,
  type MessageDetail,
  type MessageSummary,
  type Profile,
  type ThreadDetail,
  type ThreadSummary,
} from './ports';
