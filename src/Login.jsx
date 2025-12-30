// src/Login.jsx
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function Login() {
  const [mode, setMode] = useState("signin"); // signin | signup | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [debugSession, setDebugSession] = useState("unknown");

  useEffect(() => {
    setMsg("");
    setErr("");
  }, [mode]);

  async function refreshDebugSession() {
    const { data } = await supabase.auth.getSession();
    setDebugSession(data?.session ? "YES" : "NO");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    setErr("");

    try {
      if (!email) throw new Error("Please enter an email.");
      if (mode !== "reset" && !password) throw new Error("Please enter a password.");

      const cleanEmail = email.trim().toLowerCase();

      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;

        setMsg("Signed in.");
        await refreshDebugSession();
      }

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;

        if (data?.session) {
          setMsg("Account created and signed in.");
        } else {
          setMsg(
            "If this email is new, check your inbox to confirm your account. If you already have an account, use Sign in or Forgot password."
          );
        }
        await refreshDebugSession();
      }

      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;

        setMsg("Password reset email sent. Check your inbox.");
      }
    } catch (e2) {
      setErr(e2?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <h1 style={styles.title}>Standby Ledger</h1>


        <div style={styles.tabs}>
          <button
            type="button"
            onClick={() => setMode("signin")}
            style={{ ...styles.tab, ...(mode === "signin" ? styles.tabActive : {}) }}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            style={{ ...styles.tab, ...(mode === "signup" ? styles.tabActive : {}) }}
          >
            Create account
          </button>
          <button
            type="button"
            onClick={() => setMode("reset")}
            style={{ ...styles.tab, ...(mode === "reset" ? styles.tabActive : {}) }}
          >
            Forgot password
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Email
            <input
              style={styles.input}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
            />
          </label>

          {mode !== "reset" && (
            <label style={styles.label}>
              Password
              <input
                style={styles.input}
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "Create a password" : "Your password"}
              />
            </label>
          )}

          {err && <div style={styles.err}>{err}</div>}
          {msg && <div style={styles.msg}>{msg}</div>}

          <button type="submit" style={styles.btn} disabled={loading}>
            {loading
              ? "Working…"
              : mode === "signin"
              ? "Sign in"
              : mode === "signup"
              ? "Create account"
              : "Send reset email"}
          </button>
        </form>

        <p style={styles.help}>
          Tip: If sign up says “check your email”, confirm the email first, then come back and sign in.
        </p>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    background: "#f5f5f7",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "white",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  },
  title: { margin: "0 0 12px", fontSize: 28 },
  tabs: { display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" },
  tab: {
    border: "1px solid #ddd",
    borderRadius: 999,
    padding: "8px 12px",
    background: "white",
    cursor: "pointer",
    fontSize: 14,
  },
  tabActive: { borderColor: "#111" },
  form: { display: "flex", flexDirection: "column", gap: 12 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 14 },
  input: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    fontSize: 16,
  },
  btn: {
    marginTop: 4,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #111",
    background: "#111",
    color: "white",
    cursor: "pointer",
    fontSize: 16,
  },
  err: {
    background: "#ffe9e9",
    border: "1px solid #ffb8b8",
    padding: 10,
    borderRadius: 12,
    color: "#8a1f1f",
    fontSize: 14,
  },
  msg: {
    background: "#ecfdf3",
    border: "1px solid #bbf7d0",
    padding: 10,
    borderRadius: 12,
    color: "#14532d",
    fontSize: 14,
  },
  help: { marginTop: 12, fontSize: 12, color: "#666", lineHeight: 1.4 },
};
