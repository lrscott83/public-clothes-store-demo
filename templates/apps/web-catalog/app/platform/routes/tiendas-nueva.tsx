import { Form, redirect, useActionData } from 'react-router';
import { makePlatformRequest } from '../../shared/lib/platform-api.server';

export function meta() {
  return [{ title: 'Nueva tienda — Plataforma' }];
}

interface CreatedOnBehalf {
  companyName: string;
  ownerLogin: string;
  /** Plaintext — rendered ONCE in the success state, never stored again. */
  temporaryPassword: string;
}

export interface TiendasNuevaPageProps {
  error?: string;
  success?: CreatedOnBehalf;
}

/**
 * `/tiendas/nueva` action (design D6) — posts the create-on-behalf payload
 * to api-idp's superadmin-gated endpoint. The session guard is the SAME one
 * the `_platform` layout uses (`makePlatformRequest`), so an anonymous or
 * non-superadmin submission gets the IDENTICAL login redirect as everywhere
 * else on this surface. On success the plaintext temporary password travels
 * ONLY in this action's returned data — it is never logged and never sent
 * anywhere else.
 */
export async function action({ request }: { request: Request }) {
  const formData = await request.formData();

  let response: Response;
  try {
    response = await makePlatformRequest(request, '/platform/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: String(formData.get('name') ?? ''),
        slug: String(formData.get('slug') ?? ''),
        type: String(formData.get('type') ?? ''),
        ownerLogin: String(formData.get('ownerLogin') ?? ''),
        temporaryPassword: String(formData.get('temporaryPassword') ?? ''),
      }),
    });
  } catch (err) {
    if (err instanceof Response && err.status === 401) {
      const url = new URL(request.url);
      throw redirect(`/admin/login?returnTo=${encodeURIComponent(url.pathname)}`, {
        headers: err.headers,
      });
    }
    throw err;
  }

  if (!response.ok) {
    if (response.status === 409) {
      return { error: 'Ya existe una tienda con ese slug o un usuario con ese login.' };
    }
    return { error: 'Revisá los datos del formulario.' };
  }

  const data = (await response.json()) as {
    company: { name: string };
    ownerLogin: string;
    temporaryPassword: string;
  };
  return {
    success: {
      companyName: data.company.name,
      ownerLogin: data.ownerLogin,
      temporaryPassword: data.temporaryPassword,
    },
  };
}

/**
 * Create-on-behalf form (spec: "Console lists stores…" / "Temporary Password
 * Show-Once Semantics" console side). `type` offers only `'catalog'` — the
 * single value that exists today.
 */
export function TiendasNuevaPage({ error, success }: TiendasNuevaPageProps = {}) {
  if (success) {
    // Show-once success state: the plaintext appears here EXACTLY once, as
    // text — no input value, no second element retains it. There is deliberately
    // NO way to see it again; only its bcrypt hash persists server-side.
    return (
      <section>
        <h2 className="text-lg font-semibold">Tienda creada</h2>
        <p>
          La tienda <strong>{success.companyName}</strong> fue creada. El propietario{' '}
          <strong>{success.ownerLogin}</strong> ya puede ingresar con la contraseña temporal que se
          muestra abajo.
        </p>
        <p className="mt-4">
          Contraseña temporal: <strong>{success.temporaryPassword}</strong>
        </p>
        <p className="mt-2 text-sm">¡Guardala en un lugar seguro! No se mostrará de nuevo.</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-semibold">Nueva tienda</h2>
      {error && <p role="alert">{error}</p>}
      <Form method="post" className="mt-4 flex max-w-md flex-col gap-4">
        <label className="flex flex-col">
          Nombre
          <input type="text" name="name" required />
        </label>
        <label className="flex flex-col">
          Slug
          <input type="text" name="slug" required />
        </label>
        <label className="flex flex-col">
          Tipo
          <select name="type">
            <option value="catalog">catalog</option>
          </select>
        </label>
        <label className="flex flex-col">
          Usuario del propietario
          <input type="text" name="ownerLogin" required />
        </label>
        <label className="flex flex-col">
          Contraseña temporal
          <input type="text" name="temporaryPassword" required minLength={8} />
        </label>
        <button type="submit">Crear tienda</button>
      </Form>
    </section>
  );
}

export default function TiendasNuevaRoute() {
  const actionData = useActionData<typeof action>() as TiendasNuevaPageProps | undefined;
  return <TiendasNuevaPage error={actionData?.error} success={actionData?.success} />;
}
