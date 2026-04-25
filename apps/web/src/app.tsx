import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout';
import { HomePage } from './pages/home-page';
import { GraphPage } from './pages/graph-page';
import { NodePage } from './pages/node-page';
import { SearchPage } from './pages/search-page';
import { StorageProvider } from './context/storage-context';
import { GraphProvider } from './context/graph-context';
import { ViewPage } from './pages/view-page';

const App = () => {
  return (
    <StorageProvider>
      <GraphProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="graph/:graphId" element={<GraphPage />}>
                <Route path="node/:nodeId" element={<NodePage />} />
                <Route path="view/:viewId" element={<ViewPage />} />
                {/* Default graph view: could be a dashboard or redirect to search/last node */}
                <Route index element={<SearchPage />} />
              </Route>
              <Route path="search" element={<SearchPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </GraphProvider>
    </StorageProvider>
  );
};

export default App;
