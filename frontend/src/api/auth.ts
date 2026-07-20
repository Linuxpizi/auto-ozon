import { apiPost } from "./index";

export interface AuthUser {
  id: number;
  email: string;
  name?: string | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload extends LoginPayload {
  name?: string;
}

export function login(payload: LoginPayload): Promise<AuthResponse> {
  return apiPost<AuthResponse>("/auth/login", payload);
}

export function register(payload: RegisterPayload): Promise<AuthResponse> {
  return apiPost<AuthResponse>("/auth/register", payload);
}