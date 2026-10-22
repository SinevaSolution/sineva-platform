import { SNAvatar, type SNAvatarSize } from './sn_avatar';

const SIZES: SNAvatarSize[] = ['xs', 'sm', 'md', 'lg', 'xl'];

export function SNAvatarGallery() {
  return (
    <section aria-labelledby="gallery-sn-avatar" className="space-y-4">
      <h2 id="gallery-sn-avatar" className="text-lg font-semibold text-text">
        SNAvatar
      </h2>
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-24 text-xs text-text-tertiary">initials</span>
        {SIZES.map((size) => (
          <SNAvatar key={size} name="Faishal Rahman" size={size} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-24 text-xs text-text-tertiary">one word</span>
        <SNAvatar name="Madonna" />
        <span className="w-24 text-xs text-text-tertiary">email only</span>
        <SNAvatar name="" email="zed@example.com" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-24 text-xs text-text-tertiary">image</span>
        {SIZES.map((size) => (
          <SNAvatar key={size} name="Sino" src="/mascot/v011/sino-wave.webp" size={size} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="w-24 text-xs text-text-tertiary">decorative</span>
        <SNAvatar name="Faishal Rahman" decorative />
        <span className="text-sm text-text">Faishal Rahman</span>
      </div>
    </section>
  );
}
