import { Form, useActionData } from 'react-router';
import { createSession, apiIdpBaseUrl } from '../lib/session.server';
import type { Route } from './+types/login';

export function meta() {
  return [{ title: 'Ingresar' }];
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string };
}

/**
 * Authenticates against `api-idp`'s `POST /auth/login`. `returnTo` comes
 * from the query string (set by `withAuth`'s redirect, design D7) and
 * defaults to `/admin`. On failure, returns one generic message regardless
 * of cause — never distinguishes "unknown login" from "wrong password"
 * (enumeration risk), and the response body never contains the tokens
 * (catalog-admin spec: "never exposes the token to the client" — they
 * only ever travel via `createSession`'s `Set-Cookie`).
 */
export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const login = String(formData.get('login') ?? '');
  const password = String(formData.get('password') ?? '');
  const returnTo = new URL(request.url).searchParams.get('returnTo') || '/admin';

  const response = await fetch(`${apiIdpBaseUrl()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password }),
  });

  if (!response.ok) {
    return { error: 'Usuario o contraseña incorrectos.' };
  }

  const { accessToken, refreshToken, user } = (await response.json()) as LoginResponse;
  return createSession(accessToken, refreshToken, user.id, returnTo);
}

export interface LoginPageProps {
  error?: string;
}

export function LoginPage({ error }: LoginPageProps) {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <Form method="post" className="w-full max-w-sm bg-surface border border-border rounded-lg p-8 shadow-card">
        <h1 className="text-xl font-bold text-text mb-6">Acceso administrador</h1>
        {error && (
          <p role="alert" className="mb-4 text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="mb-4">
          <label htmlFor="login" className="block text-sm font-medium text-text mb-1">
            Usuario
          </label>
          <input
            id="login"
            name="login"
            type="text"
            required
            autoComplete="username"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-text"
          />
        </div>
        <div className="mb-6">
          <label htmlFor="password" className="block text-sm font-medium text-text mb-1">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-text"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-md bg-primary text-white font-medium py-2 hover:bg-primary-hover transition-colors"
        >
          Ingresar
        </button>
      </Form>
    </main>
  );
}

export default function LoginRoute() {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  return <LoginPage error={actionData?.error} />;
}
