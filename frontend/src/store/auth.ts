import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { login as loginRequest, register as registerRequest, type AuthUser } from "../api/auth";
import {
  AUTH_SESSION_CLEARED_EVENT,
  TOKEN_KEY,
  USER_KEY,
  clearStoredAuthSession,
  getStoredAccessToken,
} from "../auth/session";

function readUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

export const useAuthStore = defineStore("auth", () => {
  const token = ref(getStoredAccessToken());
  const user = ref<AuthUser | null>(readUser());
  const isAuthenticated = computed(() => Boolean(token.value));

  function saveSession(nextToken: string, nextUser?: AuthUser) {
    token.value = nextToken;
    localStorage.setItem(TOKEN_KEY, nextToken);
    if (nextUser) {
      user.value = nextUser;
      localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    }
  }

  async function login(email: string, password: string) {
    const response = await loginRequest({ email, password });
    saveSession(response.access_token, response.user);
  }

  async function register(email: string, password: string, name?: string) {
    const response = await registerRequest({ email, password, name: name || undefined });
    saveSession(response.access_token, response.user);
  }

  function logout() {
    clearStoredAuthSession();
  }

  function handleAuthExpired() {
    token.value = null;
    user.value = null;
  }

  window.addEventListener(AUTH_SESSION_CLEARED_EVENT, handleAuthExpired);

  return { token, user, isAuthenticated, login, register, logout };
});