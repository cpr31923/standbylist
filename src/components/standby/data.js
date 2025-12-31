// src/components/standby/data.js
import { supabase } from "../../supabaseClient";

export async function fetchStandbyById(id) {
  if (!id) return { data: null, error: new Error("Missing id") };

  const { data, error } = await supabase
    .from("standby_events")
    .select("*")
    .eq("id", id)
    .single();

  return { data, error };
}
