// src/Login.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase, APP_VERSION } from "./supabaseClient";

export default function Login() {
  const [mode, setMode] = useState("signin"); // signin | signup | reset

  // Shared (must persist across mode switches)
  const [email, setEmail] = useState("");

  // Secondary / fallback only
  const [password, setPassword] = useState("");
  const [showPasswordSignin, setShowPasswordSignin] = useState(false);
  const [usePasswordFallback, setUsePasswordFallback] = useState(false);

  // Optional signup details
  const [signupStep, setSignupStep] = useState("email"); // email | details
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [homePlatoon, setHomePlatoon] = useState("");

  // UX state
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false); // “check your email” state for magic links
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const cleanEmail = useMemo(() => (email || "").trim().toLowerCase(), [email]);

  useEffect(() => {
    // Don’t clear email when switching modes
    setMsg("");
    setErr("");
    setLoading(false);
    setSent(false);

    if (mode === "signup") setSignupStep("email");

    // Reset password fallback when leaving signin
    if (mode !== "signin") {
      setUsePasswordFallback(false);
      setPassword("");
      setShowPasswordSignin(false);
    }

    // If leaving signup, reset the details step
    if (mode !== "signup") {
      setSignupStep("email");
      setFirstName("");
      setLastName("");
      setHomePlatoon("");
    }
  }, [mode]);

  function setErrorNice(e) {
    const m = e?.message || "";
    // Keep it calm and non-technical
    if (String(m).toLowerCase().includes("invalid login")) {
      setErr("That didn’t work. Check your details and try again.");
      return;
    }
    setErr(m || "Something went wrong. Try again.");
  }

  async function sendMagicLink({ intent }) {
    if (!cleanEmail) {
      setErr("Enter your email address to continue.");
      return;
    }

    setLoading(true);
    setErr("");
    setMsg("");
    setSent(false);

    try {
      const redirectTo = `${window.location.origin}/auth/callback`;

      // Magic Link / OTP email
      // shouldCreateUser:
      // - signin: false (don’t create new users accidentally)
      // - signup: true (create + verify via link)
      const shouldCreateUser = intent === "signup";

      const payload = {
        email: cleanEmail,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser,
        },
      };

      // For signup, attach optional profile metadata
      if (intent === "signup") {
        payload.options.data = {
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          full_name: `${firstName.trim()} ${lastName.trim()}`.trim() || null,
          home_platoon: homePlatoon || null,
        };
      }

      const { error } = await supabase.auth.signInWithOtp(payload);
      if (error) throw error;

      setSent(true);
      if (intent === "signup") {
        setMsg("Check your email — we’ve sent a link to verify and sign you in.");
      } else {
        setMsg("Check your email — we’ve sent a sign-in link.");
      }
    } catch (e) {
      setErrorNice(e);
    } finally {
      setLoading(false);
    }
  }

  async function signInWithPassword() {
    if (!cleanEmail) {
      setErr("Enter your email address to continue.");
      return;
    }
    if (!password) {
      setErr("Enter your password to sign in.");
      return;
    }

    setLoading(true);
    setErr("");
    setMsg("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (error) throw error;
      setMsg("Signed in.");
    } catch (e) {
      setErrorNice(e);
    } finally {
      setLoading(false);
    }
  }

  async function sendReset() {
    if (!cleanEmail) {
      setErr("Enter your email address to continue.");
      return;
    }

    setLoading(true);
    setErr("");
    setMsg("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      if (error) throw error;

      setMsg("Check your email — we’ve sent a password reset link.");
    } catch (e) {
      setErrorNice(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    setMsg("");

    if (mode === "signin") {
      if (usePasswordFallback) {
        await signInWithPassword();
      } else {
        await sendMagicLink({ intent: "signin" });
      }
      return;
    }

    if (mode === "reset") {
      await sendReset();
      return;
    }

    // signup
    if (signupStep === "email") {
      if (!cleanEmail) {
        setErr("Enter your email address to continue.");
        return;
      }
      setSignupStep("details");
      return;
    }

    await sendMagicLink({ intent: "signup" });
  }

  const primaryButtonText =
    loading
      ? "Sending…"
      : mode === "signin"
      ? (usePasswordFallback ? "Sign in" : "Send sign-in link")
      : mode === "reset"
      ? "Send reset link"
      : signupStep === "email"
      ? "Continue"
      : "Create account";

  return (
    <div style={styles.wrap}>
      <div style={styles.stack}>
        <div style={styles.card}>
          <h1 style={styles.title}>Shift IOU</h1>

          {/* Only two primary intents */}
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
                disabled={loading}
              />
            </label>

            {/* SIGN IN copy + options */}
            {mode === "signin" && !sent && (
              <div style={styles.helpBlock}>
                {usePasswordFallback ? (
                  <>
                    Sign in with your password (if you have created one).
                  </>
                ) : (
                  <>
                    We’ll email you a sign-in link. No password needed.
                  </>
                )}
              </div>
            )}

            {/* SIGN IN fallback password UI */}
            {mode === "signin" && usePasswordFallback && !sent && (
              <label style={styles.label}>
                Password
                <div style={styles.passwordRow}>
                  <input
                    style={{ ...styles.input, ...styles.passwordInput }}
                    type={showPasswordSignin ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordSignin((v) => !v)}
                    style={styles.eyeBtn}
                    disabled={loading}
                  >
                    {showPasswordSignin ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
            )}

            {/* SIGN UP */}
            {mode === "signup" && (
              <>
                {signupStep === "email" ? (
                  <div style={styles.helpBlock}>
                    Start with your email. We’ll send a link to verify and sign you in.
                  </div>
                ) : (
                  <>
                    <div style={styles.helpBlock}>
                      Optional details — you can skip all of this and set it later in Settings.
                    </div>

                    <div style={styles.twoCol}>
                      <label style={styles.label}>
                        First name (optional)
                        <input
                          style={styles.input}
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="First name"
                          autoComplete="given-name"
                          disabled={loading}
                        />
                      </label>

                      <label style={styles.label}>
                        Last name (optional)
                        <input
                          style={styles.input}
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Last name"
                          autoComplete="family-name"
                          disabled={loading}
                        />
                      </label>
                    </div>

                    <label style={styles.label}>
                      Home platoon (optional)
                      <select
                        style={styles.select}
                        value={homePlatoon}
                        onChange={(e) => setHomePlatoon(e.target.value)}
                        disabled={loading}
                      >
                        <option value="">Skip for now</option>
                        <option value="A">A Platoon</option>
                        <option value="B">B Platoon</option>
                        <option value="C">C Platoon</option>
                        <option value="D">D Platoon</option>
                      </select>
                    </label>

                    <div style={styles.legal}>
                      By creating an account, you agree to the app’s terms and privacy policy (see Settings → About).
                    </div>
                  </>
                )}
              </>
            )}

            {/* RESET (secondary intent) */}
            {mode === "reset" && (
              <div style={styles.helpBlock}>
                We’ll email you a reset link. <span style={styles.muted}>If you didn’t request it, just ignore the email.</span>
              </div>
            )}

            {/* “Check your email” state */}
            {sent && (
              <div style={styles.sentBox}>
                <div style={styles.sentTitle}>Check your email</div>
                <div style={styles.sentText}>
                  We sent a sign-in link to <b>{cleanEmail}</b>.
                  <br />
                  If you didn’t request this, you can ignore the email.
                </div>

                <div style={styles.sentActions}>
                  <button
                    type="button"
                    style={styles.secondaryBtn}
                    onClick={() => {
                      setSent(false);
                      setMsg("");
                    }}
                    disabled={loading}
                  >
                    Use a different email
                  </button>

                  <button
                    type="button"
                    style={styles.secondaryBtn}
                    onClick={() => {
                      // resend
                      if (mode === "signup") {
                        sendMagicLink({ intent: "signup" });
                      } else {
                        sendMagicLink({ intent: "signin" });
                      }
                    }}
                    disabled={loading}
                  >
                    Resend link
                  </button>
                </div>
              </div>
            )}

            {err && <div style={styles.err}>{err}</div>}
            {msg && !sent && <div style={styles.msg}>{msg}</div>}

            {!sent && (
              <button type="submit" style={styles.btn} disabled={loading}>
                {primaryButtonText}
              </button>
            )}

            {/* Secondary actions (never competing with primary CTA) */}
            {!sent && mode === "signin" && (
              <div style={styles.secondaryLinks}>
                <button
                  type="button"
                  onClick={() => {
                    setUsePasswordFallback((v) => !v);
                    setErr("");
                    setMsg("");
                  }}
                  style={styles.linkBtn}
                  disabled={loading}
                >
                  {usePasswordFallback ? "Use email link instead" : "Use password instead"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode("reset");
                    setErr("");
                    setMsg("");
                  }}
                  style={styles.linkBtn}
                  disabled={loading}
                >
                  Forgot password?
                </button>
              </div>
            )}

            {!sent && mode === "reset" && (
              <div style={styles.secondaryLinks}>
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  style={styles.linkBtn}
                  disabled={loading}
                >
                  Back to sign in
                </button>
              </div>
            )}

            {!sent && mode === "signup" && signupStep === "details" && (
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

          <div style={styles.footerHelp}>
            <div style={styles.footerLine}>
              Having trouble? Double-check spam/junk folders for the sign-in email.
            </div>
          </div>
        </div>

        <div style={{ ...styles.bottomFooter }}>
          <b>© {new Date().getFullYear()} Shift IOU. <div style={styles.footerLineMuted}>v.{APP_VERSION}</div></b>
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
  stack: { width: "100%", maxWidth: 460 },
  card: {
    width: "100%",
    background: "white",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  },
  title: {
    margin: "0 0 12px",
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
    marginBottom: 10,
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

  trustRow: { display: "flex", gap: 8, marginBottom: 12 },
  trustPill: {
    fontSize: 12,
    border: "1px solid #eee",
    background: "#fafafa",
    color: "#333",
    padding: "6px 10px",
    borderRadius: 999,
  },

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

  linkBtn: {
    background: "transparent",
    border: "none",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    color: "#444",
    fontSize: 13,
    textDecoration: "underline",
  },
  secondaryLinks: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 4,
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
  muted: { color: "#666" },

  legal: {
    marginTop: 4,
    fontSize: 12,
    color: "#666",
    lineHeight: 1.4,
  },

  sentBox: {
    border: "1px solid #eee",
    background: "#fafafa",
    borderRadius: 12,
    padding: 12,
  },
  sentTitle: { fontSize: 14, fontWeight: 700, marginBottom: 6, color: "#111" },
  sentText: { fontSize: 13, color: "#333", lineHeight: 1.4 },
  sentActions: { display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" },

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

  footerHelp: { marginTop: 14, fontSize: 12, color: "#666", lineHeight: 1.4 },
  footerLine: { marginBottom: 6 },
  footerLineMuted: { color: "#888" },

  bottomFooter: { textAlign: "center", marginTop: 12, fontSize: 12, color: "#666" },
};
