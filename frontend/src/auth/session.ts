export const TOKEN_KEY = "access_token";
export const USER_KEY = "auth_user";
export const AUTH_SESSION_CLEARED_EVENT = "auto-ozon:auth-session-cleared";

export function getStoredAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearStoredAuthSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event(AUTH_SESSION_CLEARED_EVENT));
}