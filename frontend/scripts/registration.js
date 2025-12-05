import { supabase } from "./supabase.js";

const passwordRequirements = {
  minLength: {
    label: "At least 8 characters",
    test: (password) => password.length >= 8,
  },
  hasNumber: {
    label: "Has a number",
    test: (password) => /\d/.test(password),
  },
  hasUpperCase: {
    label: "Has an uppercase letter",
    test: (password) => /[A-Z]/.test(password),
  },
  hasLowerCase: {
    label: "Has a lowercase letter",
    test: (password) => /[a-z]/.test(password),
  },
};

const form = document.getElementById("register-form");
form.addEventListener("submit", (e) => {
  e.preventDefault();
  register();
});

async function register() {
  const formData = new FormData(form);
  const email = formData.get("email")
  const password = formData.get("password");

  if(!email.trim() || !password.trim()) {
    alert("Missing email or password");
    return;
  }

  if(!Object.values(passwordRequirements).every(({ test }) => test(password))) {
    alert("Your password must: \n" +
      "- Be at least 8 characters\n" +
      "- Have a number\n" +
      "- Have a lowercase letter\n" +
      "- Have an uppercase letter"
    );
    return;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if(error) {
    console.error("Error signing up:", error);
    alert("There was a problem signing up. Try again later.");
    return;
  }

  console.log("Registered user!", data);

  // grab: data.user.user_id
  // insert into public.User 
}