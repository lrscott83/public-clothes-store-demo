import React, { useEffect, useRef } from 'react';
import { ArrowRight, Truck, Shield, Star, Package } from 'lucide-react';
import { products } from '../data/products';
import ProductCard from '../components/ProductCard';

import corbata1 from './images/corbatas/corbata1.webp';

const LandingPage = () => {
  const featuresRef = useRef<HTMLDivElement>(null);
  const saleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('opacity-100', 'translate-y-0');
          }
        });
      },
      { threshold: 0.1 }
    );

    if (featuresRef.current) observer.observe(featuresRef.current);
    if (saleRef.current) observer.observe(saleRef.current);

    return () => observer.disconnect();
  }, []);

  const features = [
    {
      icon: Star,
      title: 'Colecciones Seleccionadas',
      description: 'Productos cuidadosamente elegidos para ti',
    },
    {
      icon: Shield,
      title: 'Pago Seguro',
      description: 'Transacciones 100% seguras',
    },
    {
      icon: Truck,
      title: 'Envío Gratis',
      description: 'En compras mayores a $50',
    },
    {
      icon: Package,
      title: 'Devolución Garantizada',
      description: '30 días de garantía',
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative h-screen flex items-center">
      
        <div className="absolute inset-0 z-0">
        <img
            src="hero5.jpg"
            alt="Hero"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black bg-opacity-50" />
        </div>
        
        <div className="container mx-auto px-4 z-10">
          <div className="max-w-3xl text-white">
            <h1 className="text-5xl font-bold mb-6 animate-fade-in">
              Descubre Productos Exclusivos a Precios Increíbles
            </h1>
            <p className="text-xl mb-8 animate-fade-in delay-200">
              Calidad excepcional y variedad incomparable para tu estilo de vida
            </p>
            
            <form className="flex gap-4 max-w-md animate-fade-in delay-400">
              <input
                type="email"
                placeholder="Tu correo electrónico"
                className="flex-1 px-4 py-3 rounded-lg text-gray-900"
              />
              <button className="bg-indigo-600 px-6 py-3 rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2">
                ¡Suscríbete Ahora!
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section
        ref={featuresRef}
        id="caracteristicas"
        className="py-20 bg-gray-50 opacity-0 translate-y-10 transition-all duration-700"
      >
        <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold mb-12 text-center">
            Características
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="p-6 bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow"
              >
                <feature.icon className="w-12 h-12 text-indigo-600 mb-4" style={{ color: "#EF4444" }}/>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products on Sale Section */}
      <section
        ref={saleRef}
        id="ofertas"
        className="py-20 opacity-0 translate-y-10 transition-all duration-700"
      >
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold mb-12 text-center">
            Ofertas Especiales
          </h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {products
              .filter((product) => product.discount)
              .map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
          </div>
        </div>
      </section>

      {/* New Products Section */}
      <section id="novedades" className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold mb-12 text-center">
            Nuevos Productos
          </h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {products
              .filter((product) => product.isNew)
              .map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage