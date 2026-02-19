// index.js - Public Landing Page

const API_URL = "https://blood-donor-backend-mj35.onrender.com";

async function loadPublicRequests() {
    const container = document.getElementById("public-requests-list");
    if (!container) return;

    container.innerHTML = "<p style='text-align:center; padding:40px;'>Loading active blood requests...</p>";

    try {
        const response = await fetch(`${API_URL}/api/requests/public`);

        if (!response.ok) throw new Error("Failed");

        const requests = await response.json();

        if (requests.length === 0) {
            container.innerHTML = `<p style="text-align:center; color:#666; padding:40px;">No active requests right now.<br>Be the first to help!</p>`;
            return;
        }

        container.innerHTML = "";

        requests.forEach(req => {
            const card = document.createElement("div");
            card.className = "request-card";
            card.innerHTML = `
                <div class="blood-type-badge">${req.blood_type}</div>
                <h4>Requested by: <strong>${req.recipient_name}</strong></h4>
                <p><i class="fas fa-map-marker-alt"></i> ${req.city}</p>
                <p><strong>Reason:</strong> ${req.reason || "Urgent medical need"}</p>
                <p><i class="fas fa-calendar"></i> Needed: ${new Date(req.date_needed || req.date_requested).toLocaleDateString()}</p>
                
                <a href="register.html" class="register-btn" style="margin-top:15px;display:block;text-align:center;">
                    <i class="fas fa-user-plus"></i> Register to Help
                </a>
            `;
            container.appendChild(card);
        });
    } catch (err) {
        container.innerHTML = `<p style="text-align:center;color:#d32f2f;padding:40px;">Unable to load requests right now.<br>Please try again later.</p>`;
    }
}

// Run when page loads
window.onload = loadPublicRequests;