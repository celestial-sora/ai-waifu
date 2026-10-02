"use client";

export async function authFetch(path: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(path, options);
  if (response.status === 401 || response.status === 403) {
    const reason = response.status === 403 ? "access_denied" : "session_expired";
    window.location.replace(`/login?error=${reason}`);
  }
  return response;
}
