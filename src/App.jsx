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

    async function load() {
      const { data, error } = await supabase.auth.getSession();
      if (error) console.error("getSession error:", error);
      if (!alive) return;
      setSession(data?.session ?? null);
      setLoading(false);
    }

    load();

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log("AUTH EVENT:", event, !!newSession);
      setSession(newSession ?? null);
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;

  return (
    <div>
      {/* Debug line so we can SEE what App thinks */}
      <div style={{ padding: 8, fontSize: 12, color: "#666" }}>
        App sees session: <b>{session ? "YES" : "NO"}</b>
      </div>

      {session ? <StandbyList /> : <Login />}
    </div>
  );
}
