export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  category: string;
  image: string;
  isNew?: boolean;
  discount?: number;
}

export interface Category {
  id: string;
  name: string;
}

export interface Theme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    accent: string;
    border: string;
  };
  hero: {
    backgroundImage: string;
    headlineColor: string;
    subheadingColor: string;
  };
  logo: {
    icon: 'Store' | 'ShoppingBag' | 'Package';
    color: string;
  };
}