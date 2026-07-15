import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import WizardInstaller from './WizardInstaller.jsx';
import DashboardLayout from './layouts/DashboardLayout.jsx';
import Dashboard from './pages/kcp/Dashboard.jsx';
import Fleet from './pages/kcp/Fleet.jsx';
import Storage from './pages/kcp/Storage.jsx';
import Virt from './pages/kcp/Virt.jsx';
import LocalSettings from './pages/kcp/LocalSettings.jsx';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/v1/system/identity')
      .then(res => {
        if (!res.ok) throw new Error('No identity');
        return res.json();
      })
      .then(data => {
        setIdentity(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="w-10 h-10 border-4 border-kryonix-blue border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !identity) {
    return <WizardInstaller />;
  }

  const role = identity.role || 'Desktop';
  const isCore = role === 'Core' || role === 'ThinkServer';

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardLayout role={role} />}>
          {isCore ? (
            <>
              <Route index element={<Dashboard />} />
              <Route path="fleet" element={<Fleet />} />
              <Route path="storage" element={<Storage />} />
              <Route path="virt" element={<Virt />} />
              <Route path="local-settings" element={<LocalSettings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          ) : (
            <>
              <Route path="local-settings" element={<LocalSettings />} />
              <Route path="*" element={<Navigate to="/local-settings" replace />} />
            </>
          )}
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
