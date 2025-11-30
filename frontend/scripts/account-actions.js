import { supabase } from "./supabase.js";

const loginForm = document.getElementById("login-form");
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  signIn();
})

async function signIn() {
  const formData = new FormData(loginForm);
  const email = formData.get("email");
  const password = formData.get("password");
  console.log(email);
  console.log(password);

  if(!email.trim() || !password.trim()) {
    alert("Please enter an email and password");
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  // Clear login form values
  loginForm.reset();

  if(error) {
    console.error("Error signing in:", error);
    alert("Error signing in.");
    return;
  }

  console.log("signed in!", data);
}
