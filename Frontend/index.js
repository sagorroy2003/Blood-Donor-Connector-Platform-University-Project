// index.js
const API_URL = "https://blood-donor-backend-mj35.onrender.com";

async function loadPublicRequests() {
    const container = document.getElementById("public-requests-list");
    if (!container) return;

    try {
        const response = await fetch(`${API_URL}/api/requests/public`);
        const requests = await response.json();

        if (requests.length === 0) {
            container.innerHTML = `<p class="empty-msg">No active requests right now.</p>`;
            return;
        }

        container.innerHTML = requests
            .map(
                (req) => `
            <div class="request-card">
                <div class="badge-container">
                    <div class="blood-type-badge">${req.blood_type}</div>
                </div>
                
                <div class="card-content">
                    <h3 class="patient-name">${req.recipient_name || "Anonymous"}</h3>
                    
                    <p class="hospital">
                        <i class="fas fa-hospital-alt"></i> 
                        ${req.city || "Noakhali"}, Bangladesh
                    </p>
                    
                    <div class="details">
                        <div>
                            <span class="label">Reason</span>
                            <span class="value">${req.reason || "Urgent medical need"}</span>
                        </div>
                        <div>
                            <span class="label">Needed by</span>
                            <span class="value">${new Date(
                    req.date_needed,
                ).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                })}</span>
                        </div>
                    </div>
                    
                    <div class="location">
                        <i class="fas fa-map-marker-alt"></i> 
                        ${req.city} Area
                    </div>
                </div>

                <a href="register.html" class="register-help-btn">
                    <i class="fas fa-hand-holding-heart"></i>
                    Register to Help
                </a>
            </div>
        `,
            )
            .join("");
    } catch (err) {
        console.error("Error loading public requests:", err);
        container.innerHTML = `<p class="error-msg">Unable to load requests right now. Please try again later.</p>`;
    }
}

// Load when page is ready
window.onload = loadPublicRequests;
