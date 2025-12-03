import supabaseAdmin from "../lib/supabaseAdmin";

export async function getProfile(userID: string) {
  const { data, error } = await supabaseAdmin
    .from("Users")
    .select("*")
    .eq("user_id", userID)
    .single();

  if (error) {
    console.error("Error getting profile:", error);
    return null;
  }

  return data;
}