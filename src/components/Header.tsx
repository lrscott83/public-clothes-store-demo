import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ShoppingCart, Moon, Sun } from 'lucide-react';
import { useTheme, ThemeIcon } from '../context/ThemeContext';

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);

      // Solo actualizar la sección activa si estamos en la página principal
      if (location.pathname === '/') {
        const sections = ['propuesta', 'caracteristicas', 'ofertas', 'novedades'];
        let currentSection = '';

        for (const section of sections) {
          const element = document.getElementById(section);
          if (element) {
            const rect = element.getBoundingClientRect();
            if (rect.top <= 100 && rect.bottom >= 100) {
              currentSection = section;
              break;
            }
          }
        }

        // Si no estamos en ninguna sección específica y estamos al inicio
        if (!currentSection && window.scrollY < 100) {
          currentSection = '';
        }

        setActiveSection(currentSection ? `#${currentSection}` : '');
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Llamar inmediatamente para establecer el estado inicial

    return () => window.removeEventListener('scroll', handleScroll);
  }, [location.pathname]);

  // Actualizar la sección activa cuando cambia la URL
  useEffect(() => {
    if (location.hash) {
      setActiveSection(location.hash);
    } else if (location.pathname === '/') {
      setActiveSection('');
    } else {
      setActiveSection(location.pathname);
    }
  }, [location]);

  const isActiveLink = (path: string) => {
    if (path === '/') {
      return location.pathname === '/' && !activeSection;
    }
    if (path.startsWith('#')) {
      return activeSection === path;
    }
    return location.pathname === path;
  };

  const scrollToSection = (sectionId: string) => {
    setIsMenuOpen(false);
    
    // Si no estamos en la página de inicio, navegar allí primero
    if (location.pathname !== '/') {
      window.location.href = `/${sectionId}`;
      return;
    }

    const element = document.getElementById(sectionId.replace('#', ''));
    if (element) {
      const headerOffset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };[]

  const navLinks = [
    { name: 'Inicio', path: '/' },
    { name: 'Características', path: '#caracteristicas' },
    { name: 'Ofertas', path: '#ofertas' },
    { name: 'Novedades', path: '#novedades' },
    { name: 'Productos', path: '/productos' },
  ];

  const log = () => {
    console.log("inicio");
  }

  return (
    <header 
      className={`fixed w-full z-50 transition-all duration-300 ${
        isScrolled ? 'shadow-md' : ''
      }`}
      style={{ 
        backgroundColor: isScrolled ? theme.colors.surface : 'transparent',
      }}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link 
            to="/" 
            className="flex items-center space-x-2 text-2xl font-bold transition-colors duration-300"
            style={{ color: theme.logo.color }}
          >
            <ThemeIcon name={theme.logo.icon} />
            <span>Boutique Exclusiva</span>
          </Link>

          <nav className="hidden md:flex space-x-8">
            {navLinks.map((link) => (
              link.path.startsWith('#') ? (
                <button
                  key={link.path}
                  onClick={() => scrollToSection(link.path)}
                  className="text-sm font-medium transition-colors duration-300"
                  style={{ 
                    color: isActiveLink(link.path)
                      ? theme.colors.accent 
                      : theme.colors.text
                  }}
                >
                  {link.name}
                </button>
              ) : (
                <Link
                  key={link.path}
                  to={link.path}
                  className="text-sm font-medium transition-colors duration-300"
                  style={{ 
                    color: isActiveLink(link.path)
                      ? theme.colors.accent 
                      : theme.colors.text 
                  }}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {link.name}
                </Link>
              )
            ))}
          </nav>

          <div className="flex items-center space-x-4">
            {/* <button 
              onClick={toggleTheme}
              className="p-2 rounded-full transition-colors duration-300 hover:bg-opacity-10"
              style={{ 
                color: theme.colors.text,
                backgroundColor: `${theme.colors.text}10`
              }}
            >
              {theme.name === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>

            <button 
              className="p-2 rounded-full transition-colors duration-300 hover:bg-opacity-10"
              style={{ 
                color: theme.colors.text,
                backgroundColor: `${theme.colors.text}10`
              }}
            >
              <ShoppingCart className="w-6 h-6" />
            </button> */}

            <button
              className="md:hidden p-2"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              style={{ color: theme.colors.text }}
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div 
          className="md:hidden"
          style={{ backgroundColor: theme.colors.surface }}
        >
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {navLinks.map((link) => (
              link.path.startsWith('#') ? (
                <button
                  key={link.path}
                  onClick={() => scrollToSection(link.path)}
                  className="block w-full text-left px-3 py-2 text-base font-medium transition-colors duration-300"
                  style={{ 
                    color: location.pathname === '/' && location.hash === link.path
                      ? theme.colors.accent 
                      : theme.colors.text 
                  }}
                >
                  {link.name}
                </button>
              ) : (
                <Link
                  key={link.path}
                  to={link.path}
                  className="block px-3 py-2 text-base font-medium transition-colors duration-300"
                  style={{ 
                    color: location.pathname === link.path 
                      ? theme.colors.accent 
                      : theme.colors.text 
                  }}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {link.name}
                </Link>
              )
            ))}
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;