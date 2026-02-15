import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, NavLink } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductsPage } from "./pages/ProductsPage";
import { ProcessingPage } from "./pages/ProcessingPage";
import { TagsPage } from "./pages/TagsPage";
import { ProductDetailPage } from "./pages/ProductDetailPage";
import { ImportToastProvider } from "./components/ImportToastProvider";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 2 },
  },
});

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">📦</span>
          <span className="logo-text">ASIN Manager</span>
        </div>
        <NavLink to="/products" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
          📋 Products
        </NavLink>
        <NavLink to="/processing" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
          ⚡ Processing
        </NavLink>
        <NavLink to="/tags" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
          🏷️ Tags
        </NavLink>
      </nav>
      <main className="main-content">{children}</main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ImportToastProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Navigate to="/products" replace />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/products/:asin" element={<ProductDetailPage />} />
              <Route path="/processing" element={<ProcessingPage />} />
              <Route path="/tags" element={<TagsPage />} />
            </Routes>
          </Layout>
        </ImportToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
