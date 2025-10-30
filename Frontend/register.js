const API_URL = "https://blood-donor-backend-mj35.onrender.com";

const bloodTypeSelect = document.getElementById('blood-type');
const registerForm = document.getElementById('register-form');
const messageElement = document.getElementById('message');

// 1. Fetch blood types and fill the dropdown
async function populateBloodTypes() {
    try {
        const response = await fetch(`${API_URL}/api/bloodtypes`);
        const bloodTypes = await response.json();

        bloodTypeSelect.innerHTML = ''; // Clear "Loading..."

        bloodTypes.forEach(bt => {
            const option = document.createElement('option');
            option.value = bt.blood_type_id;
            option.textContent = bt.type;
            bloodTypeSelect.appendChild(option);
        });

    } catch (err) {
        console.error(err);
        bloodTypeSelect.innerHTML = '<option value="">Failed to load</option>';
    }
}

// --- 1. Get the submit button (add this line) ---
const submitButton = registerForm.querySelector('button[type="submit"]');

// 2. Listen for the form submission
registerForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // Stop the form from reloading the page

    // --- 2. Disable the button and show feedback (add this) ---
    submitButton.disabled = true;
    submitButton.textContent = 'Processing...';
    messageElement.textContent = ''; // Clear any old errors

    // Get all the values from the form
    const formData = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
        date_of_birth: document.getElementById('dob').value,
        contact_phone: document.getElementById('phone').value,
        city: document.getElementById('city').value,
        blood_type_id: bloodTypeSelect.value
    };

    // Send the data to the backend
    try {
        const response = await fetch(`${API_URL}/api/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (!response.ok) {
            // If server sent an error (like "email exists")
            // --- 3. Re-enable button on error (add this) ---
            submitButton.disabled = false;
            submitButton.textContent = 'Register';
            throw new Error(result.message);
        }

        // Success!
        messageElement.textContent = 'Registration successful!';
        messageElement.style.color = 'green';
        registerForm.reset();
        
        // Button stays disabled on success because we are redirecting

        // Wait ? seconds, then redirect to new page
        setTimeout(() => {
            window.location.href = "check-email.html";
        }, 600); // ? milliseconds = ? seconds
        // ---------------

    } catch (err) {
        messageElement.textContent = `Error: ${err.message}`;
        messageElement.style.color = 'red';
        
        // --- 4. Re-enable button on critical error (add this) ---
        submitButton.disabled = false;
        submitButton.textContent = 'Register';
    }
});

// Run this function when the page loads
populateBloodTypes();