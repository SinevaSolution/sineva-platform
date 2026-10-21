// JSON contract for `/api/v1/me/profile` as the browser sees it. The server
// entity must stay assignable to this view (`server/http/profile_view_contract.ts`).
export interface ProfileView {
  id: string;
  email: string;
  email_verified: boolean;
  full_name: string;
  avatar_url: string | null;
  locale: string;
  timezone: string;
  created_at: string;
}
