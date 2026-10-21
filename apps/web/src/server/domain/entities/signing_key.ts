export type SigningKeyStatus = 'active' | 'next' | 'retired';
export type SigningKeyPurpose = 'context' | 'mcp_access_token';

export interface SigningKeyEntity {
  id: string;
  kid: string;
  alg: string;
  public_key: string;
  status: SigningKeyStatus;
  purpose: SigningKeyPurpose;
  valid_from: string;
  valid_until: string;
  created_at: string;
  updated_at: string;
}
