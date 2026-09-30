import { NoticeClient } from '../../../features/notice/notice.client';
import { pageMetadata } from '../../nav';

export const metadata = pageMetadata('/notices');

/** Next 15 hands `params` as a promise; the id is the only thing the page reads from it. */
export default async function NoticePage({ params }: { params: Promise<{ noticeId: string }> }) {
  const { noticeId } = await params;
  return <NoticeClient noticeId={noticeId} />;
}
