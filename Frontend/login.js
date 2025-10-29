const API_URL = "https://blood-donor-backend-mj35.onrender.com";

const loginForm = document.getElementById("login-form");
const messageElement = document.getElementById("message");

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault(); // Stop the form from reloading

    const formData = {
        email: document.getElementById("email").value,
        password: document.getElementById("password").value,
    };

    try {
        const response = await fetch(`${API_URL}/api/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(formData),
        });

        const result = await response.json();

        if (!response.ok) {
            // Server sent an error (e.g., "Invalid email or password")
            throw new Error(result.message);
        }

        // SUCCESS! We got a token.
        messageElement.textContent = "Login successful! Redirecting to dashboard...";
        messageElement.style.color = "green";

        // Store the token in the browser's local storage
        localStorage.setItem("token", result.token);

        // redirect to a dashboard page here
        setTimeout(() => {
            window.location.href = "dashboard.html";
        }, 1500);



    } catch (err) {
        messageElement.textContent = `Error: ${err.message}`;
        messageElement.style.color = "red";
    }
});
