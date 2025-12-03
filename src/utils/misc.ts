import supabase from "../lib/supabase";

export async function getProfile(userID: string) {
  const { data, error } = await supabase
    .from("User")
    .select("first_name, last_name, phone_number, email, latitude, longitude")
    .eq("user_id", userID) // WHERE
    .single(); // return 1 object;

  if (error) {
    console.error("[supabase] error fetching user", error);
    return null;
  }
  return data;
}