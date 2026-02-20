// register.js - PROFESSIONAL REFACTOR (Feb 2026)
// Added: Client-side validation, Toast notifications, safe DOM state restoration.

const API_URL = "https://blood-donor-backend-mj35.onrender.com";

// --- 1. UI & DOM Initialization ---
const registerForm = document.getElementById('register-form');
const bloodTypeSelect = document.getElementById('blood-type');

function initUI() {
    // Mobile Menu
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');
    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            hamburger.classList.toggle('open');
        });
    }

    // Restrict Date of Birth to past dates only
    const dobInput = document.getElementById('dob');
    if (dobInput) {
        const today = new Date().toISOString().split('T')[0];
        dobInput.setAttribute('max', today);
    }
}

// --- 2. Data Fetching ---
async function populateBloodTypes() {
    try {
        const response = await fetch(`${API_URL}/api/bloodtypes`);
        if (!response.ok) throw new Error("Network response was not ok");
        
        const bloodTypes = await response.json();
        bloodTypeSelect.innerHTML = '<option value="">-- Select Blood Type --</option>'; 

        bloodTypes.forEach(bt => {
            bloodTypeSelect.insertAdjacentHTML('beforeend', `<option value="${bt.blood_type_id}">${bt.type}</option>`);
        });
    } catch (err) {
        console.error("Blood type fetch error:", err);
        bloodTypeSelect.innerHTML = '<option value="">Failed to load blood types</option>';
        
        // Disable submit if we can't load required form data
        const submitBtn = registerForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        
        if (typeof showToast === 'function') {
            showToast("Error loading form data. Please check your connection and refresh.", "error");
        }
    }
}

// --- 3. Form Validation & Submission ---
if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        // Client-Side Validation Optimization
        const phone = document.getElementById('phone').value.trim();
        const bdPhoneRegex = /^01[3-9]\d{8}$/; // Validates standard BD 11-digit numbers
        
        if (!bdPhoneRegex.test(phone)) {
            if (typeof showToast === 'function') {
                showToast("Please enter a valid 11-digit phone number (e.g., 017...).", "error");
            }
            return; // Stop execution before hitting the API
        }

        const formData = {
            name: document.getElementById('name').value.trim(),
            email: document.getElementById('email').value.trim(),
            password: document.getElementById('password').value,
            date_of_birth: document.getElementById('dob').value,
            contact_phone: phone,
            city: document.getElementById('city').value.trim(),
            blood_type_id: bloodTypeSelect.value
        };

        const submitBtn = registerForm.querySelector('button[type="submit"]');
        const originalBtnHTML = submitBtn.innerHTML; // Safely save the FontAwesome icon

        // Loading State
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processing...`;

        try {
            const response = await fetch(`${API_URL}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            // Clearer variable naming for error states
            if (!response.ok) {
                const errorPayload = await response.json();
                throw new Error(errorPayload.message || "Registration failed");
            }

            // Success State
            if (typeof showToast === 'function') {
                showToast("Registration successful! Redirecting...", "success");
            }

            registerForm.reset();

            // Slightly longer delay so the user can read the success Toast
            setTimeout(() => {
                window.location.href = "check-email.html";
            }, 1200);

        } catch (err) {
            // Error State
            if (typeof showToast === 'function') {
                showToast(err.message, "error");
            } else {
                alert(`Error: ${err.message}`);
            }
            
            // Restore button properly so user can try again
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHTML;
        }
    });
}

// --- 4. Bootstrapping ---
window.addEventListener('DOMContentLoaded', () => {
    initUI();
    populateBloodTypes();
});