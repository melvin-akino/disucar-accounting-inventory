import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Realtime channel helpers
export function subscribeToOrders(onUpdate: (payload: unknown) => void) {
  return supabase
    .channel("orders")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, onUpdate)
    .subscribe();
}
