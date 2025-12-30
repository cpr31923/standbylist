// src/App.jsx
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";
import StandbyList from "./components/StandbyList";

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    // Initial load (for refreshes)
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error("getSession error:", error);
      if (alive) {
        setSession(data?.session ?? null);
        setLoading(false);
      }
    });

    // Backup listener
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;

  if (!session) {
    return <Login onAuthed={(s) => setSession(s)} />;
  }

  return <StandbyList />;
}
