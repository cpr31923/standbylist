// src/App.jsx
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";
import StandbyList from "./components/StandbyList";

function FullscreenLoading({ text = "Getting things ready…" }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f5f7",
        padding: 16,
      }}
    >
      <div style={{ color: "#666", fontSize: 14 }}>{text}</div>
    </div>
  );
}

function AuthCallback() {
  const [status, setStatus] = useState("Signing you in…");

  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        // Robust to refresh + duplicate loads
        // If the URL contains a code (PKCE), this exchanges it for a session.
        // If not, detectSessionInUrl/getSession still covers token-based flows.
        const url = window.location.href;

        try {
          // supabase-js v2 method
          await supabase.auth.exchangeCodeForSession(url);
        } catch (_e) {
          // Ignore and fall back to getSession
        }

        const { data, error } = await supabase.auth.getSession();
        if (!alive) return;

        if (error) {
          console.error("Auth callback getSession error:", error);
          setStatus("Couldn’t complete sign-in. Try again from the app.");
          return;
        }

        if (data?.session) {
          setStatus("All set. Taking you back…");
          window.location.replace("/");
          return;
        }

        setStatus("No active session found. Try signing in again.");
      } catch (e) {
        console.error("Auth callback error:", e);
        if (!alive) return;
        setStatus("Couldn’t complete sign-in. Try again from the app.");
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, []);

  return <FullscreenLoading text={status} />;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // Dedicated callback route
  const pathname = window.location.pathname || "/";
  if (pathname === "/auth/callback") {
    return <AuthCallback />;
  }

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

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  if (loading) return <FullscreenLoading />;

  return (
    <div style={{ overflowX: "hidden" }}>
      {session ? <StandbyList /> : <Login />}
    </div>
  );
}
