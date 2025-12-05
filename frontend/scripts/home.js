import { supabase } from "./supabase.js";

(async () => {
  const registerCard = document.querySelector("div.register.welcome-card");
  if (!registerCard) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    console.log("Home: User is logged in. Hiding register.");
    registerCard.classList.add("displayNone");
  }
})();
