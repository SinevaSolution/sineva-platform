/**
 * What a round trip to an identity provider is for. `link` and `reauth` act on
 * an already signed-in person, so their state also carries that person's id:
 * the callback refuses to continue when the browser's session belongs to
 * someone else.
 */
export type OAuthIntent = 'sign_in' | 'link' | 'reauth';

export const OAUTH_INTENTS: readonly OAuthIntent[] = ['sign_in', 'link', 'reauth'];
