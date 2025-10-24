const API_URL = 'http://localhost:3001';

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

// 2. Listen for the form submission
registerForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // Stop the form from reloading the page

    // Get all the values from the form
    const formData = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
        date_of_birth: document.getElementById('dob').value,
        contact_phone: document.getElementById('phone').value,
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
            throw new Error(result.message);
        }

        // Success!
        messageElement.textContent = 'Registration successful! You can now log in.';
        messageElement.style.color = 'green';
        registerForm.reset();

    } catch (err) {
        messageElement.textContent = `Error: ${err.message}`;
        messageElement.style.color = 'red';
    }
});

// Run this function when the page loads
populateBloodTypes();