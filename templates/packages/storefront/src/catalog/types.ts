export interface StoreCategory {
  id: string;
  name: string;
  order?: number;
}

export interface StoreProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  categoryId: string;
  image: string;
  images?: string[];
  originalPrice?: number;
  isNew?: boolean;
  discount?: number;
}

export interface CatalogData {
  categories: StoreCategory[];
  products: StoreProduct[];
}

/**
 * Seam between the storefront UI and however product/category data is
 * sourced. The default implementation (`createBakedCatalogProvider`) reads
 * from a build-time JSON import; a future remote provider can implement the
 * same synchronous-first shape without touching any UI consumer.
 */
export interface CatalogProvider {
  getCategories(): StoreCategory[];
  getProducts(): StoreProduct[];
  getProductById(id: string): StoreProduct | undefined;
  getProductsByCategory(categoryId: string): StoreProduct[];
}
