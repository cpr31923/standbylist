// src/App.jsx
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";
import StandbyList from "./components/StandbyList";

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.error("getSession error:", error);
        if (!cancelled) setSession(data?.session ?? null);
      } catch (e) {
        console.error("init auth error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      cancelled = true;
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!session) return <Login />;
  return <StandbyList />;
}
