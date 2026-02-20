// index.js - Professional Public Landing Page Logic

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

// --- 2. Reusable Card Component ---
// This acts like a React functional component, taking 'props' (req) and returning UI.
function createPublicCardHTML(req) {
    // Robust Error Handling: Safe date parsing fallback
    const displayDate = req.date_needed 
        ? new Date(req.date_needed).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : "ASAP";

    const reasonText = req.reason || "Urgent medical need";
    const patientName = req.recipient_name || "Anonymous";
    const cityText = req.city || "Noakhali";

    return `
        <div class="request-card">
            <div class="badge-container">
                <div class="blood-type-badge">${req.blood_type}</div>
            </div>
            
            <div class="card-content">
                <h3 class="patient-name">${patientName}</h3>
                
                <p class="hospital">
                    <i class="fas fa-hospital-alt"></i> ${cityText}, Bangladesh
                </p>
                
                <div class="details">
                    <div>
                        <span class="label">Reason</span>
                        <span class="value reason-text">${reasonText}</span>
                    </div>
                    <div>
                        <span class="label">Needed by</span>
                        <span class="value">${displayDate}</span>
                    </div>
                </div>
                
                <div class="location">
                    <i class="fas fa-map-marker-alt"></i> ${cityText} Area
                </div>
            </div>

            <a href="register.html" class="register-help-btn">
                <i class="fas fa-hand-holding-heart"></i> Help Now
            </a>
        </div>
    `;
}

// --- 3. Main Data Fetching Logic ---
async function loadPublicRequests() {
    const container = document.getElementById("public-requests-list");
    if (!container) return;

    // Inject loading state before fetch begins to ensure immediate UI feedback
    container.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading urgent requests...</p>
        </div>
    `;

    try {
        const response = await fetch(`${API_URL}/api/requests/public`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const requests = await response.json();

        if (!requests || requests.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; grid-column: 1 / -1; padding: 40px;">
                    <p class="empty-msg" style="color: #666; font-size: 1.1rem;">
                        No active requests right now.<br>Thank you to our amazing community!
                    </p>
                </div>
            `;
            return;
        }

        // Map data to the component factory
        container.innerHTML = requests.map(req => createPublicCardHTML(req)).join("");

    } catch (err) {
        console.error("Error loading public requests:", err);
        container.innerHTML = `
            <div style="text-align: center; grid-column: 1 / -1; padding: 40px;">
                <p class="error-msg" style="color: #d32f2f; font-weight: 600;">
                    Unable to load requests right now. Please check your connection and try again later.
                </p>
            </div>
        `;
    }
}

// --- 4. Bootstrapping ---
window.addEventListener('DOMContentLoaded', () => {
    initMobileMenu();
    loadPublicRequests();
});