import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import StandbyList from "./components/StandbyList.jsx";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setUser(data?.session?.user ?? null);
      setChecking(false);
    }

    loadSession();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setChecking(false);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const handleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    // user will be set by onAuthStateChange
    if (!data?.session) {
      alert("Logged in, but no session returned (check email confirmation in Supabase).");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (checking) {
    return <div style={{ padding: 20 }}>Checking session…</div>;
  }

  if (user) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <button onClick={handleLogout}>Log out</button>
        </div>
        <StandbyList />
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 420 }}>
      <h1>Login</h1>

      <input
        placeholder="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ display: "block", marginBottom: 10, padding: 8, width: "100%" }}
      />

      <input
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ display: "block", marginBottom: 10, padding: 8, width: "100%" }}
      />

      <button onClick={handleLogin} style={{ padding: "8px 12px" }}>
        Login
      </button>
    </div>
  );
}
