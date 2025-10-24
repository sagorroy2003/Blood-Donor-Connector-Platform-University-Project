const API_URL = 'http://localhost:3001';

const userNameEl = document.getElementById('user-name');
const userEmailEl = document.getElementById('user-email');
const userPhoneEl = document.getElementById('user-phone');
const logoutButton = document.getElementById('logout-button');

// This function runs immediately when the page loads
(async function () {
    // 1. Get the token from local storage
    const token = localStorage.getItem('token');

    if (!token) {
        // 2. If NO token, redirect to login
        window.location.href = 'login.html';
        return;
    }

    // 3. If token EXISTS, try to fetch the protected profile
    try {
        const response = await fetch(`${API_URL}/api/profile`, {
            method: 'GET',
            headers: {
                // 4. Send the token in the Authorization header
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            // 5. If token is bad (expired, etc.), redirect to login
            throw new Error(data.message);
        }

        // 6. If token is GOOD, display the user's data
        userNameEl.textContent = data.name;
        userEmailEl.textContent = data.email;
        userPhoneEl.textContent = data.contact_phone;

    } catch (err) {
        console.error('Auth Error:', err);
        // If any error, token is probably bad, so clear it and redirect
        localStorage.removeItem('token');
        window.location.href = 'login.html';
    }
})();

// Add logic for the logout button
logoutButton.addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
});