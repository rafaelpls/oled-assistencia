'use client';
import { useEffect, useState } from 'react';
import Login, { ChangePassword } from '../components/Login';
import { api } from '../lib/api';
import App from '../components/App';
export default function Page() {
  const [user, setUser] = useState<any>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    api('/auth/me')
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="loading">Carregando OLED…</div>;
  if (!user) return <Login onLogin={setUser} />;
  if (user.mustChangePassword) return <ChangePassword onDone={() => setUser(null)} />;
  return <App user={user} logout={() => setUser(null)} />;
}
