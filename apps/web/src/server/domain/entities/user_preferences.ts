export const THEMES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEMES)[number];

export const DENSITIES = ['comfortable', 'compact'] as const;
export type DensityPreference = (typeof DENSITIES)[number];

export interface UserPreferencesEntity {
  theme: ThemePreference;
  density: DensityPreference;
  /** Plain background, no character (Rooms). */
  focus_mode: boolean;
  /** Forces reduced motion; the operating system setting is honoured regardless. */
  reduce_motion: boolean;
  sidebar_collapsed: boolean;
  /** Stops the animated character in Rooms. */
  pause_character: boolean;
  /** Hub shows the Room view of the specialist that answered. */
  room_view: boolean;
}

// A user with no row gets these. `GET` never writes them back, so changing a
// default here changes it for everyone who has not chosen yet.
export const DEFAULT_USER_PREFERENCES: UserPreferencesEntity = {
  theme: 'system',
  density: 'comfortable',
  focus_mode: false,
  reduce_motion: false,
  sidebar_collapsed: false,
  pause_character: false,
  room_view: false,
};
