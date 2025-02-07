import React from 'react';
import { Product } from '../types';
import { useTheme } from '../context/ThemeContext';

interface ProductCardProps {
  product: Product;
}

const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { theme } = useTheme();

  return (
    <div 
      className="group relative rounded-lg shadow-md overflow-hidden transform transition-all duration-300 hover:scale-[1.02]"
      style={{ backgroundColor: theme.colors.surface }}
    >
      {(product.isNew || product.discount) && (
        <div className="absolute top-2 left-2 z-10 flex gap-2">
          {product.isNew && (
            <span className="bg-green-500 text-white px-2 py-1 text-xs rounded-full">
              Nuevo
            </span>
          )}
          {product.discount && (
            <span className="bg-red-500 text-white px-2 py-1 text-xs rounded-full">
              -{product.discount}%
            </span>
          )}
        </div>
      )}
      
      <div className="aspect-w-1 aspect-h-1 w-full overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-64 object-cover transform transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      
      <div className="p-4">
        <h3 
          className="text-lg font-semibold"
          style={{ color: theme.colors.text }}
        >
          {product.name}
        </h3>
        <p 
          className="mt-1 text-sm"
          style={{ color: theme.colors.textSecondary }}
        >
          {product.description}
        </p>
        
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span 
              className="text-lg font-bold"
              style={{ color: theme.colors.accent }}
            >
              ${product.price.toFixed(2)}
            </span>
            {product.originalPrice && (
              <span 
                className="text-sm line-through"
                style={{ color: theme.colors.textSecondary }}
              >
                ${product.originalPrice.toFixed(2)}
              </span>
            )}
          </div>
          
          {/* <button 
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-300"
            style={{ 
              backgroundColor: theme.colors.accent,
              color: theme.colors.surface
            }}
          >
            Comprar Ahora
          </button> */}
        </div>
      </div>
    </div>
  );
};

export default ProductCard;