import { describe, expect, it } from 'vitest';
import { createBakedCatalogProvider } from '@store-mgmt/storefront/catalog';
import { buildStoreConfig } from '../../components/__tests__/test-fixtures';
import { HOME_SECTIONS, hiddenHomeAnchors, resolveHomeSections } from '../home-sections';

const categories = [{ id: 'cat', name: 'Category' }];

function make(
  products: Parameters<typeof createBakedCatalogProvider>[0]['products'],
  configOverrides = {},
) {
  const config = buildStoreConfig({
    catalog: { categories, products },
    ...configOverrides,
  });
  const catalog = createBakedCatalogProvider(config.catalog);
  return { config, catalog };
}

const base = {
  name: 'Item',
  description: 'desc',
  price: 10,
  categoryId: 'cat',
  image: '/x.jpg',
};

describe('resolveHomeSections', () => {
  it('marks offers present only when a product has a discount', () => {
    const { config, catalog } = make([{ id: '1', ...base, discount: 20 }]);
    const presence = resolveHomeSections(config, catalog);
    expect(presence.offers).toBe(true);
    expect(presence.newArrivals).toBe(false);
  });

  it('marks new-arrivals present only when a product isNew', () => {
    const { config, catalog } = make([{ id: '1', ...base, isNew: true }]);
    const presence = resolveHomeSections(config, catalog);
    expect(presence.newArrivals).toBe(true);
    expect(presence.offers).toBe(false);
  });

  it('marks features present only when config has feature entries', () => {
    const withFeatures = make([{ id: '1', ...base }], {
      features: [{ icon: 'Star', title: 'F', description: 'D' }],
    });
    const withoutFeatures = make([{ id: '1', ...base }], { features: [] });
    expect(resolveHomeSections(withFeatures.config, withFeatures.catalog).features).toBe(true);
    expect(resolveHomeSections(withoutFeatures.config, withoutFeatures.catalog).features).toBe(
      false,
    );
  });
});

describe('hiddenHomeAnchors', () => {
  it('hides the new-arrivals anchor when no products are new (the NOVA appliances case)', () => {
    const { config, catalog } = make([{ id: '1', ...base, discount: 15 }], {
      features: [{ icon: 'Star', title: 'F', description: 'D' }],
    });
    const hidden = hiddenHomeAnchors(resolveHomeSections(config, catalog));
    expect(hidden).toContain(`#${HOME_SECTIONS.newArrivals}`);
    expect(hidden).not.toContain(`#${HOME_SECTIONS.offers}`);
    expect(hidden).not.toContain(`#${HOME_SECTIONS.features}`);
  });

  it('hides every conditional anchor when the page has none of the sections', () => {
    const { config, catalog } = make([{ id: '1', ...base }], { features: [] });
    const hidden = hiddenHomeAnchors(resolveHomeSections(config, catalog));
    expect(hidden).toEqual([
      `#${HOME_SECTIONS.features}`,
      `#${HOME_SECTIONS.offers}`,
      `#${HOME_SECTIONS.newArrivals}`,
    ]);
  });
});
