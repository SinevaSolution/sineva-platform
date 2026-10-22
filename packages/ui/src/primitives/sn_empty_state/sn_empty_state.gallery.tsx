import { SNButton } from '../sn_button/sn_button';
import { SNEmptyState } from './sn_empty_state';

export function SNEmptyStateGallery() {
  return (
    <section aria-labelledby="gallery-sn-empty-state" className="space-y-8">
      <h2 id="gallery-sn-empty-state" className="text-lg font-semibold text-text">
        SNEmptyState
      </h2>
      <SNEmptyState
        headingLevel={3}
        title="No chats yet"
        description="Start a chat with Sino and it will show up here."
        action={<SNButton variant="primary">New chat</SNButton>}
      />
      <SNEmptyState
        headingLevel={3}
        pose="thumbs-up"
        title="All caught up"
        description="Nothing needs your review right now."
      />
      <SNEmptyState
        headingLevel={3}
        pose="wave"
        title="Welcome"
        description="Pick a specialist to get started."
      />
    </section>
  );
}
