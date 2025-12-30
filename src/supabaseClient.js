import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://gmtmzifpiagbayqospbh.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtdG16aWZwaWFnYmF5cW9zcGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzIyMDgsImV4cCI6MjA4MjQwODIwOH0.IdUYJFJqrFavugX31PdXO04QQLZ2kN6cXuglgC1dJTA";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: window.localStorage,      // <- persist session here
    persistSession: true,              // <- keep session across refresh
    autoRefreshToken: true,            // <- refresh before expiry
    detectSessionInUrl: true,          // <- supports magic links / oauth redirects
  },
});
