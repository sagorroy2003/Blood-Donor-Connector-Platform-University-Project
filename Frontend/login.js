// login.js - PROFESSIONAL REFACTOR (Feb 2026)
// Features: Button loading states, Toast integration, and secure JWT handling.

const API_URL = "https://blood-donor-backend-mj35.onrender.com";

// --- 1. UI Initialization (Mobile Menu) ---
function initMobileMenu() {
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');
    
    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            hamburger.classList.toggle('open');
        });
    }
}

// --- 2. Authentication Logic ---
const loginForm = document.getElementById("login-form");

if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        // Extract credentials
        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;
        const submitBtn = loginForm.querySelector('button[type="submit"]');

        // Apply loading state to button
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Authenticating...`;
        submitBtn.disabled = true;

        try {
            const response = await fetch(`${API_URL}/api/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email, password }),
            });

            const result = await response.json();

            // Handle Server Errors (e.g., "Invalid email or password")
            if (!response.ok) {
                throw new Error(result.message || "Failed to login. Please check your credentials.");
            }

            // SUCCESS: Trigger Global Toast
            if (typeof showToast === 'function') {
                showToast("Login successful! Redirecting...", "success");
            }

            // Store the JWT token securely in localStorage
            localStorage.setItem("token", result.token);

            // Snappy redirection to dashboard
            setTimeout(() => {
                window.location.href = "dashboard.html";
            }, 1200); // 1.2s delay allows the user to see the success toast

        } catch (err) {
            // ERROR: Trigger Global Toast
            if (typeof showToast === 'function') {
                showToast(err.message, "error");
            } else {
                alert(`Error: ${err.message}`); // Fallback
            }
            
            // Restore button state so the user can try again
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
        }
    });
}

// --- 3. Bootstrapping ---
window.addEventListener('DOMContentLoaded', () => {
    initMobileMenu();
});