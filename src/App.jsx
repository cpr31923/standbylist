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

    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) console.error("getSession error:", error);

      // CRITICAL: Don't overwrite an existing session with null
      if (alive) {
        setSession((prev) => prev ?? data?.session ?? null);
        setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // CRITICAL: Some events can deliver null; don't clobber a real session.
      setSession((prev) => newSession ?? prev ?? null);
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;

  return (
    <div>
      {/* TEMP DEBUG: leave this in until everything works */}
      <div style={{ padding: 8, fontSize: 12, color: "#666" }}>
        Auth session: {session ? "YES" : "NO"}
      </div>

      {!session ? (
        <Login
          onAuthed={(s) => {
            // Set immediately and don’t let anything wipe it
            setSession(s);
          }}
        />
      ) : (
        <StandbyList />
      )}
    </div>
  );
}
