import React, { useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { products, categories } from '../data/products';
import ProductCard from '../components/ProductCard';

const ProductsPage = () => {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | ''>('');
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [currentPage, setCurrentPage] = useState(1);

  const filteredProducts = useMemo(() => {
    let filtered = [...products];

    if (selectedCategory) {
      filtered = filtered.filter(
        (product) => product.category === selectedCategory
      );
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (product) =>
          product.name.toLowerCase().includes(query) ||
          product.description.toLowerCase().includes(query)
      );
    }

    if (sortOrder) {
      filtered.sort((a, b) =>
        sortOrder === 'asc' ? a.price - b.price : b.price - a.price
      );
    }

    return filtered;
  }, [selectedCategory, searchQuery, sortOrder]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, startIndex + itemsPerPage);

  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 4) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      if (currentPage > 2) pages.push(currentPage - 1);
      if (currentPage !== 1 && currentPage !== totalPages) pages.push(currentPage);
      if (currentPage < totalPages - 1) pages.push(currentPage + 1);
      if (currentPage !== totalPages) pages.push(totalPages);
    }
    return pages;
  };

  const pageNumbers = getPageNumbers();

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen pt-16 bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar - Categories */}
          <div className="w-full md:w-64 space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h2 className="text-lg font-semibold mb-4">Categorías</h2>
              
              <select
                className="w-full p-2 border rounded-lg md:hidden mb-4"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="">Todas las categorías</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>

              <div className="hidden md:flex flex-col space-y-2">
                <button
                  className={`text-left px-3 py-2 rounded-lg transition-colors ${
                    selectedCategory === ''
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'hover:bg-gray-100'
                  }`}
                  onClick={() => setSelectedCategory('')}
                >
                  Todas las categorías
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    className={`text-left px-3 py-2 rounded-lg transition-colors ${
                      selectedCategory === category.id
                        ? 'bg-indigo-50 text-indigo-600'
                        : 'hover:bg-gray-100'
                    }`}
                    onClick={() => setSelectedCategory(category.id)}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {/* Search, Sort, and Items Per Page Controls */}
            <div className="bg-white p-6 rounded-lg shadow-sm mb-8">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Buscar productos..."
                    className="w-full pl-10 pr-4 py-2 border rounded-lg"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                
                <select
                  className="p-2 border rounded-lg"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc' | '')}
                >
                  <option value="">Ordenar por</option>
                  <option value="asc">Precio: Menor a Mayor</option>
                  <option value="desc">Precio: Mayor a Menor</option>
                </select>

                <select
                  className="p-2 border rounded-lg"
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value="12">12 por página</option>
                  <option value="24">24 por página</option>
                  <option value="48">48 por página</option>
                </select>
              </div>
            </div>

            {/* Products Grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {paginatedProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            {filteredProducts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">
                  No se encontraron productos que coincidan con tu búsqueda.
                </p>
              </div>
            ) : (
              /* Pagination Controls */
              <div className="flex justify-center items-center gap-2 mt-8">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                {pageNumbers.map((number, index) => {
                  const isGap = index > 0 && pageNumbers[index] - pageNumbers[index - 1] > 1;
                  return (
                    <React.Fragment key={number}>
                      {isGap && <span className="px-2">...</span>}
                      <button
                        onClick={() => handlePageChange(number)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                          currentPage === number
                            ? 'bg-indigo-600 text-white'
                            : 'hover:bg-gray-100'
                        }`}
                      >
                        {number}
                      </button>
                    </React.Fragment>
                  );
                })}

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductsPage;