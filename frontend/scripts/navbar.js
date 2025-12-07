import { supabase } from "./supabase.js";

const loginForm = document.getElementById("login-form");
const loginFormDiv = document.querySelector("div#navbar-login");
const userInfoDiv = document.querySelector("div#navbar-userinfo");
const signOutButton = document.getElementById("button-sign-out");

supabase.auth.onAuthStateChange((event, session) => {
  console.log("AUTH STATE CHANGED", event, session);

  switch (event) {
    case "INITIAL_SESSION": {
      if (session === null) {
        // Un-hide the login form div
        loginFormDiv.classList.remove("displayNone");
        // And stop here. The following code is for displaying
        // CURRENTLY LOGGED IN user information only.
        return;
      }

      showUserData();

      break;
    }
    case "SIGNED_IN": {
      showUserData();
      break;
    }
    case "SIGNED_OUT": {
      userInfoDiv.classList.add("displayNone");
      loginFormDiv.classList.remove("displayNone");
      break;
    }
  }
});

export async function showUserData() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  console.log("GOT USER:", user);

  const email = user.email;
  const p = document.querySelector("#navbar-userinfo-email");
  p.innerText = email;
  userInfoDiv.classList.remove("displayNone");
  loginFormDiv.classList.add("displayNone");
}

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  signIn();
});

async function signIn() {
  const formData = new FormData(loginForm);
  const email = formData.get("email");
  const password = formData.get("password");
  console.log(email);
  console.log(password);

  if (!email.trim() || !password.trim()) {
    alert("Please enter an email and password");
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  // Clear login form values
  loginForm.reset();

  if (error) {
    console.error("Error signing in:", error);
    alert("Error signing in.");
    return;
  }

  console.log("signed in!", data);
}

signOutButton.addEventListener("click", (e) => {
  e.preventDefault();
  supabase.auth.signOut();
})
