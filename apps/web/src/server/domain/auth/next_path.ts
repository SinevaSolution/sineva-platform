// A new person who arrives through an invitation or ownership link has no
// account yet, so the link has to survive sign-up and email verification.
// The client names the destination (`next`) and the server writes it into the
// verification email. A free-form redirect target would be an open-redirect
// vector (the link is emailed under our name), so only the two link shapes
// are accepted: a fixed prefix and a base64url token, nothing else.
const LINK_NEXT_PATH = /^\/(?:invite|ownership)\/[A-Za-z0-9_-]{16,128}$/;

export function isLinkNextPath(value: string): boolean {
  return LINK_NEXT_PATH.test(value);
}
