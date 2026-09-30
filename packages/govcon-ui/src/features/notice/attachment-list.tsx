import type { Attachment } from '@sysdesign/contracts';
import { Heading, Stack, Text } from '@sysdesign/design-system';

export interface AttachmentListProps {
  attachments: readonly Attachment[];
}

/** The notice's files as SAM.gov serves them — public links, no key, nothing spent. */
export function AttachmentList({ attachments }: AttachmentListProps) {
  return (
    <Stack gap={2}>
      <Heading level={3}>Attachments</Heading>
      {attachments.length === 0 ? (
        <Text size="sm" tone="muted">
          No attachments on this notice.
        </Text>
      ) : (
        <>
          <Stack as="ul" gap={1} aria-label="Attachments">
            {attachments.map((attachment) => (
              <li key={attachment.ordinal}>
                <a href={attachment.url} target="_blank" rel="noreferrer">
                  Attachment {attachment.ordinal + 1}
                </a>
              </li>
            ))}
          </Stack>
          <Text size="sm" tone="muted">
            Public links straight from sam.gov: each opens the file, spends nothing, and needs no
            key.
          </Text>
        </>
      )}
    </Stack>
  );
}
