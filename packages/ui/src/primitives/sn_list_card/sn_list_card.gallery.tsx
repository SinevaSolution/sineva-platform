import { FileText } from 'lucide-react';
import { SNAvatar } from '../sn_avatar/sn_avatar';
import { SNBadge } from '../sn_badge/sn_badge';
import { SNListCard } from './sn_list_card';

export function SNListCardGallery() {
  return (
    <section aria-labelledby="gallery-sn-list-card" className="max-w-md space-y-3">
      <h2 id="gallery-sn-list-card" className="text-lg font-semibold text-text">
        SNListCard
      </h2>
      <SNListCard title="Static row" description="Not interactive, no hover" />
      <SNListCard
        title="With leading and trailing"
        description="Quarterly report, updated today"
        leading={<FileText aria-hidden="true" className="size-5 text-text-secondary" />}
        trailing={<SNBadge tone="running">Running</SNBadge>}
      />
      <SNListCard
        title="Button row"
        description="onClick makes it a button"
        leading={<SNAvatar name="Sino Finance" size="sm" decorative />}
        onClick={() => {}}
      />
      <SNListCard asChild title="Link row" description="asChild renders the child element">
        <a href="#gallery-sn-list-card" />
      </SNListCard>
      <SNListCard title="Title only" onClick={() => {}} />
    </section>
  );
}
