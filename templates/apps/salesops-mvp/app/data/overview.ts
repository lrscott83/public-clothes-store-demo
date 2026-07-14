import {
  ShoppingCart,
  Users,
  Warehouse,
  ArrowLeftRight,
  Package,
  BarChart3,
  Landmark,
  type LucideIcon,
} from 'lucide-react';

/**
 * Copy + metadata for the Home overview landing (app/routes/home.tsx).
 *
 * This screen is the prospect-facing "front door": it states the MVP thesis,
 * guides a demo through the suggested path, and summarizes every view. Kept as
 * data (not hardcoded JSX) so the copy lives in one place. Spanish, voseo.
 *
 * Domain note: the owner OWES commission to gestores (payable on delivery) —
 * never the reverse — and every sale is collected, so nothing is "por cobrar".
 */

export interface TourStep {
  /** Sequence marker — this really is an ordered demo path, hence the numbering. */
  n: string;
  label: string;
  question: string;
  summary: string;
  path: string;
  icon: LucideIcon;
}

export interface ViewSummary {
  label: string;
  summary: string;
  path: string;
  icon: LucideIcon;
}

export const HERO = {
  eyebrow: 'Cuadro de mando (dashboard) · Sales Ops',
  headline: 'Tu negocio vive en tu cabeza y en el WhatsApp.',
  headlineAccent: 'Acá lo ves ordenado.',
  subhead:
    'Un cuadro de mando que en 5 segundos te muestra cuánto dinero entra, cuánto le debés a tus gestores y qué te queda limpio — con los datos que ya tenés.',
  primaryCta: { label: 'Empezá por Finanzas', path: '/finanzas' },
  secondaryCta: { label: 'o creá un pedido de prueba', path: '/pedidos/nuevo' },
} as const;

export const TOUR: TourStep[] = [
  {
    n: '01',
    label: 'Finanzas',
    question: '¿Dónde está tu dinero?',
    summary:
      'Margen neto, la comisión que le debés a tus gestores, las ventas del periodo y tu exposición a la tasa.',
    path: '/finanzas',
    icon: Landmark,
  },
  {
    n: '02',
    label: 'Decisiones',
    question: '¿Y ahora qué hago?',
    summary: 'Qué gestor rinde, qué producto deja margen y dónde se te va el dinero.',
    path: '/decisiones',
    icon: BarChart3,
  },
  {
    n: '03',
    label: 'Crear un pedido',
    question: 'Probá que es real.',
    summary: 'Cargá un pedido como gestor y miralo caer en los tableros al instante.',
    path: '/pedidos/nuevo',
    icon: ShoppingCart,
  },
];

export const VIEWS: ViewSummary[] = [
  {
    label: 'Nuevo pedido',
    summary: 'Precio en USD, cobro en MN y tasa congelada al momento de la venta.',
    path: '/pedidos/nuevo',
    icon: ShoppingCart,
  },
  {
    label: 'Operador de gestores',
    summary: 'Seguí cada pedido por estado y quién lo maneja, sin depender del WhatsApp.',
    path: '/operador-gestores',
    icon: Users,
  },
  {
    label: 'Operador de almacén',
    summary: 'Preparación y despacho por almacén, con el stock que de verdad tenés.',
    path: '/operador-almacen',
    icon: Warehouse,
  },
  {
    label: 'Tasas de cambio',
    summary: 'La tasa que te come margen, congelada por cada pedido.',
    path: '/tasas',
    icon: ArrowLeftRight,
  },
  {
    label: 'Inventario',
    summary: 'Qué tenés, qué falta y qué se vende, antes de quedarte sin lo que más rota.',
    path: '/inventario',
    icon: Package,
  },
  {
    label: 'Decisiones',
    summary: 'Qué gestor, producto o almacén te hace ganar o perder dinero.',
    path: '/decisiones',
    icon: BarChart3,
  },
  {
    label: 'Finanzas',
    summary: 'Margen neto, comisión por pagar a gestores, ventas y exposición a la tasa.',
    path: '/finanzas',
    icon: Landmark,
  },
];

export const CLOSING =
  'Todo esto salió de datos de mentira parecidos a los tuyos. Imaginate con TUS números adentro.';
