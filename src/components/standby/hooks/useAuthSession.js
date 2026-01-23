import { useEffect, useState } from "react";
import { supabase } from "../../../supabaseClient";

export function useAuthSession() {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;

      if (error) {
        console.error("Session error:", error);
        setSession(null);
        setUser(null);
        return;
      }

      setSession(data?.session ?? null);
      setUser(data?.session?.user ?? null);
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signOutHard() {
    const { error } = await supabase.auth.signOut();
    if (!error) return;

    console.warn("Supabase signOut failed, forcing local clear:", error);

    try {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (k.startsWith("sb-") && k.includes("auth")) localStorage.removeItem(k);
      }

      const skeys = Object.keys(sessionStorage);
      for (const k of skeys) {
        if (k.startsWith("sb-") && k.includes("auth")) sessionStorage.removeItem(k);
      }
    } catch (e) {
      console.warn("Local/session storage clear failed:", e);
    }

    setSession(null);
    setUser(null);
    window.location.reload();
  }

  return { user, session, signOutHard };
}
