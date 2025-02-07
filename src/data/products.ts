import { Product, Category } from '../types';
// import { corbata1 } from '../public/images/corbatas/corbata1.webp'

export const categories: Category[] = [
  { id: 'botas-hombres', name: 'Botas para Hmbres' },
  { id: 'camisas', name: 'Camisas' },
  { id: 'corbatas', name: 'Corbatas' },
  { id: 'enguatadas', name: 'Enguatadas' },
  { id: 'gorras', name: 'Gorras' },
  { id: 'gorros', name: 'Gorros' },
  { id: 'jeans', name: 'Jeans' },
  { id: 'licras', name: 'Licras' },
  { id: 'pulovers', name: 'Pulovers' },
  { id: 'sacos-hombres', name: 'Sacos para Hombres' },
  { id: 'sandalias', name: 'Sandalias' },
  { id: 'shorpetas', name: 'Shorpetas' },
  { id: 'shorts-hombres', name: 'Shorts para Hombres' },
  { id: 'shorts-mujeres', name: 'Shorts para Mujeres' },
  { id: 'sombreros', name: 'Sombreros' },
  { id: 'vestidos', name: 'Vestidos' },
  { id: 'zapatos-altos', name: 'Zapatos Altos' },
];

export const products: Product[] = [
  // botas-hombres
  {
    id: 1,
    name: 'Botas de Goma',
    description: 'Colores: Negro, Blanco y Azul',
    price: 5000.00,
    category: 'botas-hombres',
    image: '/productos/botas-hombres/botas1.webp',
  },
  {
    id: 2,
    name: 'Botas Altas',
    description: 'Colores: Negro',
    price: 5000.00,
    category: 'botas-hombres',
    image: '/productos/botas-hombres/botas2.webp',
  },
  {
    id: 3,
    name: 'Botas Normales',
    description: 'Colores: Negro y Carmelita',
    price: 3000.00,
    category: 'botas-hombres',
    image: '/productos/botas-hombres/botas3.webp',
  },
  {
    id: 4,
    name: 'Botas de Cuero',
    description: 'Colores: Negro, Blanco y Carmelita',
    price: 4000.00,
    category: 'botas-hombres',
    image: '/productos/botas-hombres/botas4.webp',
  },
  {
    id: 5,
    name: 'Botas Salir',
    description: 'Colores: Negro',
    price: 6000.00,
    category: 'botas-hombres',
    image: '/productos/botas-hombres/botas5.webp',
  },
  {
    id: 6,
    name: 'Botas Goma',
    description: 'Colores: Negro',
    price: 3000.00,
    category: 'botas-hombres',
    image: '/productos/botas-hombres/botas6.webp',
  },

  // camisas
  {
    id: 7,
    name: 'Camisa de Rayas',
    description: 'Tallas: L y XL',
    price: 1000.00,
    originalPrice: 1250.00,
    category: 'camisas',
    image: '/productos/camisas/camisa1.jpg',
    discount: 20
  },
  {
    id: 8,
    name: 'Camisa de Cuadros',
    description: 'Tallas: L y XL',
    price: 1300.00,
    category: 'camisas',
    image: '/productos/camisas/camisa2.jpg',
    isNew: true,
  },
  {
    id: 9,
    name: 'Camisa Mezclilla Clara',
    description: 'Tallas: XL',
    price: 1000.00,
    category: 'camisas',
    image: '/productos/camisas/camisa3.jpg',
  },
  {
    id: 10,
    name: 'Camisa de Rayas',
    description: 'Tallas: L',
    price: 1250.00,
    category: 'camisas',
    image: '/productos/camisas/camisa4.jpg',
  },
  {
    id: 11,
    name: 'Camisa Mezclilla Oscura',
    description: 'Tallas: L y XL',
    price: 1000.00,
    originalPrice: 1250.00,
    category: 'camisas',
    image: '/productos/camisas/camisa5.webp',
    discount: 20
  },


  // corbatas
  {
    id: 12,
    name: 'Corbata a rayas',
    description: 'Varios Colores',
    price: 500.00,
    category: 'corbatas',
    image: '/productos/corbatas/corbata1.webp',
  },
  {
    id: 13,
    name: 'Corbata a rayas',
    description: 'Varios Colores',
    price: 500.00,
    category: 'corbatas',
    image: '/productos/corbatas/corbata2.webp',
  },
  {
    id: 14,
    name: 'Corbata a rayas',
    description: 'Varios Colores',
    price: 500.00,
    category: 'corbatas',
    image: '/productos/corbatas/corbata3.webp',
  },
  {
    id: 15,
    name: 'Corbata a rayas',
    description: 'Varios Colores',
    price: 500.00,
    category: 'corbatas',
    image: '/productos/corbatas/corbata4.webp',
  },

  // enguatadas
  {
    id: 16,
    name: 'Enguatada Larga',
    description: 'Colores: Rosado',
    price: 1200.00,
    category: 'enguatadas',
    image: '/productos/enguatadas/menguatada1.jpg',
  },
  {
    id: 17,
    name: 'Enguatada Corta',
    description: 'Colores: Gris',
    price: 1200.00,
    category: 'enguatadas',
    image: '/productos/enguatadas/menguatada2.jpg',
  },
  {
    id: 18,
    name: 'Enguatada',
    description: 'Colores: Azul',
    price: 1200.00,
    category: 'enguatadas',
    image: '/productos/enguatadas/menguatada3.jpg',
  },


  // gorras
  {
    id: 19,
    name: 'Gorra Nike',
    description: 'Colores: Carmelita',
    price: 900.00,
    category: 'gorras',
    image: '/productos/gorras/gorra1.jpg',
  },
  {
    id: 58,
    name: 'Gorra Reebok',
    description: 'Colores: Rojo',
    price: 900.00,
    category: 'gorras',
    image: '/productos/gorras/gorra2.jpg',
  },
  {
    id: 59,
    name: 'Gorra Adidas',
    description: 'Colores: Azul',
    price: 900.00,
    category: 'gorras',
    image: '/productos/gorras/gorra3.jpg',
  },
  {
    id: 60,
    name: 'Gorra Puma',
    description: 'Colores: Gris',
    price: 900.00,
    category: 'gorras',
    image: '/productos/gorras/gorra4.jpg',
  },

  // gorros
  {
    id: 20,
    name: 'Gorro Frio',
    description: 'Colores: Carmelita',
    price: 3000.00,
    category: 'gorros',
    image: '/productos/gorros/gorro1.jpg',
  },
  {
    id: 21,
    name: 'Gorro Pomposo',
    description: 'Colores: Rojo',
    price: 3000.00,
    category: 'gorros',
    image: '/productos/gorros/gorro1.jpg',
  },


  // jeans
  {
    id: 22,
    name: 'Jean Color Entero',
    description: 'Colores: Oscuro',
    price: 8000.00,
    category: 'jeans',
    image: '/productos/jeans/jean1.webp',
  },
  {
    id: 23,
    name: 'Jean Color Ripiado',
    description: 'Colores: Claro',
    price: 10000.00,
    category: 'jeans',
    image: '/productos/jeans/jean2.webp',
  },
  {
    id: 24,
    name: 'Jean Ripeado',
    description: 'Colores: Claro',
    price: 10000.00,
    category: 'jeans',
    image: '/productos/jeans/jean3.webp',
  },
  {
    id: 25,
    name: 'Jean Color Entero',
    description: 'Colores: Oscuro',
    price: 8000.00,
    category: 'jeans',
    image: '/productos/jeans/jean4.webp',
  },

  // licras
  {
    id: 26,
    name: 'Licra KarolG',
    description: 'Colores: Carmelita',
    price: 2500.00,
    category: 'licras',
    image: '/productos/licras/licra1.webp',
  },
  {
    id: 27,
    name: 'Licra',
    description: 'Colores: Naranja',
    price: 2500.00,
    category: 'licras',
    image: '/productos/licras/licra2.webp',
  },

  // pulovers
  {
    id: 28,
    name: 'Pulover Color Entero',
    description: 'Colores: Verde, Azul y Rojo',
    price: 2000.00,
    category: 'pulovers',
    image: '/productos/pulovers/pulover1.jpg',
  },
  {
    id: 29,
    name: 'Pulover Color Entero',
    description: 'Colores: Verde, Azul y Rojo',
    price: 2100.00,
    category: 'pulovers',
    image: '/productos/pulovers/pulover2.jpg',
  },
  {
    id: 30,
    name: 'Pulover Color Entero',
    description: 'Colores: Verde, Azul y Rojo',
    price: 2200.00,
    category: 'pulovers',
    image: '/productos/pulovers/pulover3.jpg',
  },

  // sacos-hombres
  {
    id: 30,
    name: 'Saco Zara',
    description: 'Colores: Negro',
    price: 2200.00,
    category: 'sacos-hombres',
    image: '/productos/sacos-hombres/saco1.jpg',
  },
  {
    id: 31,
    name: 'Saco H&M',
    description: 'Colores: Gris',
    price: 2100.00,
    category: 'sacos-hombres',
    image: '/productos/sacos-hombres/saco1.jpg',
  },
  {
    id: 32,
    name: 'Saco',
    description: 'Colores: Gris Oscuro',
    price: 2000.00,
    category: 'sacos-hombres',
    image: '/productos/sacos-hombres/saco1.jpg',
  },

  // sandalias
  {
    id: 32,
    name: 'Sandalias de Correa',
    description: 'Colores: Rojo',
    price: 4000.00,
    category: 'sandalias',
    image: '/productos/sandalias/sandalia1.jpg',
  },
  {
    id: 33,
    name: 'Balerina',
    description: 'Colores: Rojo',
    price: 4000.00,
    category: 'sandalias',
    image: '/productos/sandalias/sandalia2.jpg',
  },
  {
    id: 34,
    name: 'Balerina de Correa',
    description: 'Colores: Negor',
    price: 4000.00,
    category: 'sandalias',
    image: '/productos/sandalias/sandalia3.jpg',
  },
  {
    id: 35,
    name: 'Sandalia',
    description: 'Colores: Rojo',
    price: 4000.00,
    category: 'sandalias',
    image: '/productos/sandalias/sandalia4.jpg',
  },


  // shorpetas
  {
    id: 36,
    name: 'Shorpeta',
    description: 'Colores: Azul Claro',
    price: 4000.00,
    category: 'shorpetas',
    image: '/productos/shorpetas/shorpeta1.jpg',
  },
  {
    id: 37,
    name: 'Shorpeta',
    description: 'Colores: Azul Claro',
    price: 4200.00,
    category: 'shorpetas',
    image: '/productos/shorpetas/shorpeta2.webp',
  },

  // shorts-hombres
  {
    id: 38,
    name: 'Short Medio',
    description: 'Colores: Claro',
    price: 4200.00,
    category: 'shorts-hombres',
    image: '/productos/shorts-hombres/short1.jpg',
  },
  {
    id: 39,
    name: 'Short Corto',
    description: 'Colores: Claro',
    price: 4200.00,
    category: 'shorts-hombres',
    image: '/productos/shorts-hombres/short2.jpg',
  },
  {
    id: 40,
    name: 'Short',
    description: 'Colores: Claro',
    price: 4500.00,
    category: 'shorts-hombres',
    image: '/productos/shorts-hombres/short3.jpg',
    isNew: true
  },


  // shorts-mujeres
  {
    id: 41,
    name: 'Short Corto',
    description: 'Colores: Claro',
    price: 4000.00,
    category: 'shorts-mujeres',
    image: '/productos/shorts-mujeres/short1.jpg',
  },
  {
    id: 42,
    name: 'Short Medio',
    description: 'Colores: Claro',
    price: 4300.00,
    category: 'shorts-mujeres',
    image: '/productos/shorts-mujeres/short1.jpg',
  },


  // sombreros
  {
    id: 43,
    name: 'Sombrero',
    description: 'Colores: Negro',
    price: 2100.00,
    category: 'sombreros',
    image: '/productos/sombreros/sombrero1.webp',
  },
  {
    id: 44,
    name: 'Sombrero',
    description: 'Colores: Negro',
    price: 2000.00,
    category: 'sombreros',
    image: '/productos/sombreros/sombrero2.webp',
  },
  {
    id: 45,
    name: 'Sombrero',
    description: 'Colores: Negro',
    price: 2300.00,
    category: 'sombreros',
    image: '/productos/sombreros/sombrero3.webp',
  },
  {
    id: 46,
    name: 'Sombrero',
    description: 'Colores: Negro',
    price: 2200.00,
    category: 'sombreros',
    image: '/productos/sombreros/sombrero4.webp',
  },
  {
    id: 47,
    name: 'Sombrero',
    description: 'Colores: Negro',
    price: 1800.00,
    originalPrice: 2000.00,
    category: 'sombreros',
    image: '/productos/sombreros/sombrero5.webp',
    discount: 10
  },


  // vestidos
  {
    id: 48,
    name: 'Vestido Corto',
    description: 'Colores: Negro',
    price: 4200.00,
    category: 'vestidos',
    image: '/productos/vestidos/vestido1.jpg',
    isNew: true,
  },
  {
    id: 49,
    name: 'Vestido Largo',
    description: 'Colores: Negro',
    price: 4200.00,
    category: 'vestidos',
    image: '/productos/vestidos/vestido2.jpg',
  },
  {
    id: 50,
    name: 'Vestido Largo',
    description: 'Colores: Negro',
    price: 4200.00,
    category: 'vestidos',
    image: '/productos/vestidos/vestido3.jpg',
  },
  {
    id: 51,
    name: 'Vestido Suelto',
    description: 'Colores: Negro',
    price: 4200.00,
    category: 'vestidos',
    image: '/productos/vestidos/vestido4.jpg',
  },
  {
    id: 52,
    name: 'Vestido Ajustado',
    description: 'Colores: Negro',
    price: 4200.00,
    category: 'vestidos',
    image: '/productos/vestidos/vestido5.jpg',
  },
  {
    id: 53,
    name: 'Vestido',
    description: 'Colores: Negro',
    price: 4200.00,
    category: 'vestidos',
    image: '/productos/vestidos/vestido6.jpg',
  },

  // zapatos-altos
  {
    id: 54,
    name: 'Zapato',
    description: 'Colores: Rojp',
    price: 4200.00,
    category: 'zapatos-altos',
    image: '/productos/zapatos-altos/zapato1.jpg',
  },
  {
    id: 55,
    name: 'Zapato',
    description: 'Colores: Rojp',
    price: 4200.00,
    category: 'zapatos-altos',
    image: '/productos/zapatos-altos/zapato2.jpg',
  },
  {
    id: 56,
    name: 'Zapato',
    description: 'Colores: Rojp',
    price: 4200.00,
    category: 'zapatos-altos',
    image: '/productos/zapatos-altos/zapato3.jpg',
  },
  {
    id: 57,
    name: 'Zapato',
    description: 'Colores: Rojp',
    price: 4200.00,
    category: 'zapatos-altos',
    image: '/productos/zapatos-altos/zapato4.jpg',
  },
];