import { Link, useOutletContext } from 'react-router';

export interface PlatformCompanyDto {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  type: 'catalog' | null;
}

interface PlatformContext {
  companies: PlatformCompanyDto[];
}

/**
 * `/tiendas` — platform console store list (spec: "Console lists stores for
 * a superadmin session"). Data comes from the `_platform` layout's loader
 * (Outlet context) — the guard already ran there.
 */
export function TiendasPage({ companies }: { companies: PlatformCompanyDto[] }) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tiendas</h2>
        <Link to="/tiendas/nueva" className="text-primary underline">
          Nueva tienda
        </Link>
      </div>

      {companies.length === 0 ? (
        <p>No hay tiendas todavía.</p>
      ) : (
        <table className="mt-4 w-full text-left">
          <thead>
            <tr>
              <th className="py-2">Nombre</th>
              <th className="py-2">Slug</th>
              <th className="py-2">Tipo</th>
              <th className="py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.id}>
                <td className="py-2">{company.name}</td>
                <td className="py-2">{company.slug}</td>
                <td className="py-2">{company.type ?? '—'}</td>
                <td className="py-2" data-testid={`company-status-${company.id}`}>
                  {company.isActive ? 'Activa' : 'Inactiva'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function TiendasRoute() {
  const { companies } = useOutletContext<PlatformContext>();
  return <TiendasPage companies={companies} />;
}
