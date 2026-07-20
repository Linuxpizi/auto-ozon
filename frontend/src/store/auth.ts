import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { login as loginRequest, register as registerRequest, type AuthUser } from "../api/auth";

const TOKEN_KEY = "access_token";
const USER_KEY = "auth_user";

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
  const token = ref(localStorage.getItem(TOKEN_KEY));
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
    token.value = null;
    user.value = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  return { token, user, isAuthenticated, login, register, logout };
});