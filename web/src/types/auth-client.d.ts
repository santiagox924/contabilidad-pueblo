declare module "./auth-client" {
  export function getToken(): string | undefined;
  export function setToken(token: string | null): void;
}