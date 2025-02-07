import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import Header from './components/Header';
import LandingPage from './pages/LandingPage';
import ProductsPage from './pages/ProductsPage';

function App() {
  return (
    <ThemeProvider>
      <Router>
        <AppContent />
      </Router>
    </ThemeProvider>
  );
}

function AppContent() {
  const { theme } = useTheme();

  return (
    <div 
      className="min-h-screen transition-colors duration-300"
      style={{ backgroundColor: theme.colors.background }}
    >
      <Header />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/productos" element={<ProductsPage />} />
      </Routes>
    </div>
  );
}

export default App;