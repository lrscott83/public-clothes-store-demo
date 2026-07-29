import { Client } from 'pg';

/**
 * The migration B gate (design.md §8.3). Lives in `src/` rather than in
 * `scripts/` because it is library code with a test suite — `scripts/
 * verify-order-attribution.ts` is a thin CLI wrapper over it. Hand-written SQL
 * because the assertions cross the `sales_order`/`company_user` boundary that
 * the generated Prisma client does not reason about in one query.
 */

interface AttributionRow {
  readonly orders: string;
  readonly legacy_unattributed: string;
  readonly orphans: string;
  readonly post_cutover_nulls: string;
}

export interface AttributionReport {
  readonly orders: number;
  /** Orders predating the cutover with no agent. EXPECTED and permanent — reported, never asserted. */
  readonly legacyUnattributed: number;
  readonly failures: readonly string[];
}

/**
 * Runs the §8.3 assertions against `connectionString`. `cutover` is when
 * migration A was applied to that database; every order created after it MUST
 * carry an attribution.
 */
export async function verifyOrderAttribution(
  connectionString: string,
  cutover: Date,
): Promise<AttributionReport> {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const { rows: columns } = await client.query<{ n: string }>(`
      SELECT count(*) AS n FROM information_schema.columns
      WHERE table_name = 'sales_order' AND column_name = 'attributed_company_user_id';
    `);
    if (Number(columns[0]!.n) === 0) {
      return {
        orders: 0,
        legacyUnattributed: 0,
        failures: [
          'sales_order.attributed_company_user_id does not exist — migration A has not run against ' +
            'this database. Apply it before gating migration B.',
        ],
      };
    }

    const { rows } = await client.query<AttributionRow>(
      `
      SELECT
        (SELECT count(*) FROM "sales_order")                                     AS orders,
        (SELECT count(*) FROM "sales_order"
           WHERE "attributed_company_user_id" IS NULL)                           AS legacy_unattributed,
        (SELECT count(*) FROM "sales_order" o LEFT JOIN "company_user" cu
           ON cu."id" = o."attributed_company_user_id"
           WHERE o."attributed_company_user_id" IS NOT NULL AND cu."id" IS NULL) AS orphans,
        (SELECT count(*) FROM "sales_order"
           WHERE "attributed_company_user_id" IS NULL
             AND "created_at" > $1)                                              AS post_cutover_nulls;
      `,
      [cutover],
    );

    const result = rows[0]!;
    const orders = Number(result.orders);
    const legacyUnattributed = Number(result.legacy_unattributed);
    const orphans = Number(result.orphans);
    const postCutoverNulls = Number(result.post_cutover_nulls);

    const failures: string[] = [];
    if (orphans !== 0) {
      failures.push(
        `${orphans} order(s) reference a company_user that does not exist — the FK should have made ` +
          'this impossible, so the schema itself is suspect.',
      );
    }
    if (postCutoverNulls !== 0) {
      failures.push(
        `${postCutoverNulls} order(s) created after the cutover carry no attribution — the delivery ` +
          'layer is writing unattributed orders, and accruing commission on top of that would produce ' +
          'silently incomplete payouts.',
      );
    }

    return { orders, legacyUnattributed, failures };
  } finally {
    await client.end();
  }
}
