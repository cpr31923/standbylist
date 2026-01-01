// src/Login.jsx
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function Login() {
  const [mode, setMode] = useState("signin"); // signin | signup | reset

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [homePlatoon, setHomePlatoon] = useState("");

  // Signup email-first flow
  const [signupStep, setSignupStep] = useState("email"); // email | details
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  // UX
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setMsg("");
    setErr("");
    setLoading(false);
    setShowPassword(false);

    if (mode === "signup") setSignupStep("email");
    if (mode !== "signup") {
      setSignupStep("email");
      setFirstName("");
      setLastName("");
    }
  }, [mode]);

  const cleanEmail = (email || "").trim().toLowerCase();

  async function sendReset(emailToReset) {
    const e = (emailToReset || "").trim().toLowerCase();
    if (!e) {
      setErr("Please enter an email.");
      return;
    }

    setLoading(true);
    setMsg("");
    setErr("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(e, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setMsg("Password reset email sent. Check your inbox.");
    } catch (e2) {
      setErr(e2?.message || "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    setErr("");

    try {
      if (!cleanEmail) throw new Error("Please enter an email.");

      // SIGN IN
      if (mode === "signin") {
        if (!password) throw new Error("Please enter a password.");

        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;

        setMsg("Signed in.");
        return;
      }

      // RESET
      if (mode === "reset") {
        await sendReset(cleanEmail);
        return;
      }

      // SIGN UP (email-first)
      if (mode === "signup") {
        if (signupStep === "email") {
          setSignupStep("details");
          return;
        }

        if (!firstName.trim()) throw new Error("Please enter your first name.");
        if (!lastName.trim()) throw new Error("Please enter your last name.");
        if (!password) throw new Error("Please create a password (must have uppercase, lowercase and numbers. Min. 8 characters).");
        if (password.length < 6) throw new Error("Password must be at least 6 characters.");

        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
              home_platoon: homePlatoon || null,
            },
          },
        });

        if (error) {
          const m = String(error.message || "").toLowerCase();
          if (m.includes("already") || m.includes("registered") || m.includes("exists")) {
            setErr("That email already has an account. Use Sign in, or reset your password.");
            setMode("reset");
            return;
          }
          throw error;
        }

        if (data?.session) {
          setMsg("Account created and signed in.");
        } else {
          setMsg("Account created. Check your inbox to confirm your email, then come back and sign in.");
        }
        return;
      }
    } catch (e2) {
      setErr(e2?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.stack}>
      <div style={styles.card}>
        <h1 style={styles.title}>Shift IOU</h1>

        {/* Segmented tabs: stays on one line */}
        <div style={styles.segment}>
          <button
            type="button"
            onClick={() => setMode("signin")}
            style={{ ...styles.segmentBtn, ...(mode === "signin" ? styles.segmentBtnActive : {}) }}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            style={{ ...styles.segmentBtn, ...(mode === "signup" ? styles.segmentBtnActive : {}) }}
          >
            Create account
          </button>
          <button
            type="button"
            onClick={() => setMode("reset")}
            style={{ ...styles.segmentBtn, ...(mode === "reset" ? styles.segmentBtnActive : {}) }}
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

          {mode === "signin" && (
            <label style={styles.label}>
              Password
              <div style={styles.passwordRow}>
                <input
                  style={{ ...styles.input, ...styles.passwordInput }}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={styles.eyeBtn}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>                
              </div>
            </label>
          )}

          {mode === "reset" && (
            <div style={styles.helpBlock}>
              Enter your email and we’ll send you a password reset link.
            </div>
          )}


          {mode === "signup" && (
            <>
              {signupStep === "email" ? (
                <div style={styles.helpBlock}>
                  Enter your email to begin.
                </div>
              ) : (
                <>
                  <div style={styles.twoCol}>
                    <label style={styles.label}>
                      First name
                      <input
                        style={styles.input}
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="First name"
                        autoComplete="given-name"
                      />
                    </label>
                    <label style={styles.label}>
                      Last name
                      <input
                        style={styles.input}
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Last name"
                        autoComplete="family-name"
                      />
                    </label>
                  </div>

                  <label style={styles.label}>
                      Create password
                      <div style={styles.passwordRow}>
                        <input
                          style={{ ...styles.input, ...styles.passwordInput }}
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Create a password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          style={styles.eyeBtn}
                        >
                          {showPassword ? "Hide" : "Show"}
                        </button>
                      </div>
                    </label>

                    <label style={styles.label}>
                      Home platoon (optional)
                      <select
                        style={styles.select}
                        value={homePlatoon}
                        onChange={(e) => setHomePlatoon(e.target.value)}
                      >
                        <option value="">Skip for now</option>
                        <option value="A">A Platoon</option>
                        <option value="B">B Platoon</option>
                        <option value="C">C Platoon</option>
                        <option value="D">D Platoon</option>
                      </select>
                    </label>
                </>
              )}
            </>
          )}

         {err && <div style={styles.err}>{err}</div>}
         {msg && <div style={styles.msg}>{msg}</div>}

          {mode === "signup" && signupStep === "details" && (
            <div style={styles.help}>
              By creating an account, you agree to the app’s terms and privacy policy (see Settings → About).
            </div>
          )}

          <button type="submit" style={styles.btn} disabled={loading}>
            {loading
              ? "Working…"
              : mode === "signin"
              ? "Sign in"
              : mode === "reset"
              ? "Send reset email"
              : signupStep === "email"
              ? "Continue"
              : "Create account"}
          </button>

          {mode === "signup" && signupStep === "details" && (
            <button
              type="button"
              style={styles.secondaryBtn}
              onClick={() => setSignupStep("email")}
              disabled={loading}
            >
              Back
            </button>
          )}
        </form>

        {mode === "signin" && (
          <p style={styles.help}>
            Tip: If you don't have an account, use <b>Create Account</b>. If you’ve forgotten your password, use{" "}
            <b>Forgot password</b>.
          </p>
        )}
        {mode === "signup" && (
          <p style={styles.help}>
            Tip: If you already have an account, use <b>Sign in</b>. If you’ve forgotten your password, use{" "}
            <b>Forgot password</b>.
          </p>
        )}
        {mode === "reset" && (
          <p style={styles.help}>
            Tip: If you already have an account, use <b>Sign in</b>. If you don't have an account, use <b>Create Account</b>.
          </p>
        )}
      </div>
        <div style={{ ...styles.help, textAlign: "center", marginTop: 12 }}>
          <b>© {new Date().getFullYear()} Shift IOU </b> [BETA]
        </div>
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
    maxWidth: 460,
    background: "white",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  },
  title: {
  margin: "0 0 16px",
  fontSize: 42,
  fontWeight: 750,
  letterSpacing: "-0.01em",
},


  segment: {
    display: "flex",
    width: "100%",
    border: "1px solid #ddd",
    borderRadius: 999,
    overflow: "hidden",
    marginBottom: 14,
  },
  segmentBtn: {
    flex: 1,
    padding: "10px 10px",
    background: "white",
    cursor: "pointer",
    fontSize: 13,
    border: "none",
    whiteSpace: "nowrap",
  },
  segmentBtnActive: { background: "#111", color: "white" },

  form: { display: "flex", flexDirection: "column", gap: 12 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 14 },
  input: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    fontSize: 16,
    width: "100%",
    boxSizing: "border-box",
  },

  twoCol: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },

  passwordRow: { display: "flex", gap: 8, alignItems: "center" },
  passwordInput: { flex: 1 },
  eyeBtn: {
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "white",
    padding: "10px 12px",
    cursor: "pointer",
    fontSize: 14,
    whiteSpace: "nowrap",
  },

  select: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    fontSize: 16,
    width: "100%",
    boxSizing: "border-box",
    background: "white",
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
  secondaryBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
    fontSize: 16,
  },

  helpBlock: {
    background: "#f7f7f9",
    border: "1px solid #eee",
    padding: 12,
    borderRadius: 12,
    fontSize: 14,
    color: "#333",
    lineHeight: 1.4,
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
