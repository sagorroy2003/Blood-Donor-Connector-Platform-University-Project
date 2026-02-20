// dashboard.js - UPDATED FOR PREMIUM CONSISTENT CARD DESIGN (Feb 2026)
// All cards now match the beautiful public request style (red header + floating badge)

const API_URL = "https://blood-donor-backend-mj35.onrender.com";

// --- Get Elements ---
const userNameEl = document.getElementById("user-name");
const userEmailEl = document.getElementById("user-email");
const userPhoneEl = document.getElementById("user-phone");
const logoutButton = document.getElementById("logout-button");
const requestForm = document.getElementById("request-form");
const requestMessage = document.getElementById("request-message");
const requestBloodTypeSelect = document.getElementById("request-blood-type");
const myRequestsListElement = document.getElementById("my-requests-list");
const availableRequestsListElement = document.getElementById("available-requests-list");
const donationHistoryListElement = document.getElementById("donation-history-list");
const acceptedRequestsListElement = document.getElementById("accepted-requests-list");

// --- Initial Page Load & Auth Check ---
(async function () {
    const token = localStorage.getItem("token");
    if (!token) {
        window.location.href = "login.html";
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/profile`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);

        userNameEl.textContent = data.name;
        userEmailEl.textContent = data.email;
        userPhoneEl.textContent = data.contact_phone;

        populateRequestBloodTypes();
        fetchMyRequests();
        fetchAvailableRequests();
        fetchAcceptedRequests();
        fetchDonationHistory();
    } catch (err) {
        console.error("Auth Error:", err);
        localStorage.removeItem("token");
        window.location.href = "login.html";
    }
})();

// --- Logout ---
logoutButton.addEventListener("click", () => {
    localStorage.removeItem("token");
    window.location.href = "login.html";
});

// --- Populate Blood Types ---
async function populateRequestBloodTypes() {
    try {
        const response = await fetch(`${API_URL}/api/bloodtypes`);
        const bloodTypes = await response.json();
        requestBloodTypeSelect.innerHTML = '<option value="">-- Select Blood Type --</option>';
        bloodTypes.forEach((bt) => {
            const option = document.createElement("option");
            option.value = bt.blood_type_id;
            option.textContent = bt.type;
            requestBloodTypeSelect.appendChild(option);
        });
    } catch (err) {
        console.error("Error populating blood types:", err);
        requestBloodTypeSelect.innerHTML = '<option value="">Failed to load</option>';
    }
}

// --- Submit New Blood Request ---
requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = localStorage.getItem("token");
    if (!token) return (window.location.href = "login.html");

    const requestData = {
        city: document.getElementById("request-city").value,
        blood_type_id: requestBloodTypeSelect.value,
        reason: document.getElementById("request-reason").value,
        date_needed: document.getElementById("request-date").value,
    };

    try {
        const response = await fetch(`${API_URL}/api/requests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(requestData),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        requestMessage.textContent = "Blood request created successfully!";
        requestMessage.style.color = "green";
        requestForm.reset();
        fetchMyRequests();
    } catch (err) {
        requestMessage.textContent = `Error: ${err.message}`;
        requestMessage.style.color = "red";
    }
});

// ====================== PREMIUM CARD FUNCTIONS ======================

// 1. My Requests (Recipient View)
// === UPDATED MY ACTIVE REQUESTS (Premium Daraz cards + all buttons) ===
async function fetchMyRequests() {
    const token = localStorage.getItem("token");
    myRequestsListElement.innerHTML = "<p>Loading your requests...</p>";

    try {
        const response = await fetch(`${API_URL}/api/requests/myrequests`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const requests = await response.json();
        if (!response.ok) throw new Error(requests.message || "Failed to fetch");

        if (requests.length === 0) {
            myRequestsListElement.innerHTML = "<p>You have not created any requests yet.</p>";
            return;
        }

        myRequestsListElement.innerHTML = "";
        requests.forEach((req) => {
            const card = document.createElement("div");
            card.className = "request-card";

            let actionButtons = '';

            // Show special buttons when someone accepted the request
            if (req.status === "on_hold") {
                actionButtons += `
                    <button class="accept-button fulfill-button" data-request-id="${req.request_id}">
                        <i class="fas fa-check"></i> Mark as Fulfilled
                    </button>
                    <button class="delete-button cancel-donor-button" data-request-id="${req.request_id}">
                        <i class="fas fa-times"></i> Cancel Accepted Donor
                    </button>
                `;
            }

            // Delete button for any request that is not already fulfilled
            if (req.status !== "fulfilled") {
                actionButtons += `
                    <button class="delete-button delete-request-button" data-request-id="${req.request_id}">
                        <i class="fas fa-trash"></i> Delete Request
                    </button>
                `;
            }

            card.innerHTML = `
                <div class="badge-container">
                    <div class="blood-type-badge">${req.blood_type}</div>
                </div>
                <div class="card-content">
                    <h3 class="patient-name">My Request</h3>
                    <p class="hospital">
                        <i class="fas fa-hospital-alt"></i> ${req.city || 'Noakhali'}, Bangladesh
                    </p>
                    
                    <div class="details">
                        <div>
                            <span class="label">Reason</span>
                            <span class="value">${req.reason || "Urgent medical need"}</span>
                        </div>
                        <div>
                            <span class="label">Status</span>
                            <span class="value">${req.status.toUpperCase()}</span>
                        </div>
                    </div>
                    
                    <div class="location">
                        <i class="fas fa-map-marker-alt"></i> 
                        Posted ${new Date(req.date_requested || Date.now()).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})}
                    </div>
                </div>
                <div class="button-group" style="padding: 0 16px 16px; display: flex; flex-direction: column; gap: 10px;">
                    ${actionButtons}
                </div>
            `;
            myRequestsListElement.appendChild(card);
        });
    } catch (err) {
        console.error("Error fetching my requests:", err);
        myRequestsListElement.innerHTML = `<p>Error loading requests: ${err.message}</p>`;
    }
}

// 2. Available Requests (Donor View)
// === UPDATED AVAILABLE REQUESTS (works with new backend) ===
// === FINAL AVAILABLE REQUESTS (City Only - No Blood Type Filter) ===
// === DEBUG VERSION - Available Requests (City Only) ===
async function fetchAvailableRequests() {
    const token = localStorage.getItem("token");
    availableRequestsListElement.innerHTML = "<p>Loading available requests near you...</p>";

    try {
        console.log("%c🔄 Fetching available requests...", "color: blue; font-weight: bold");

        const response = await fetch(`${API_URL}/api/requests/available`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        const data = await response.json();
        console.log("✅ Raw backend response:", data);

        const requests = Array.isArray(data) ? data : (data.requests || []);
        console.log(`📊 Found ${requests.length} requests in your city`);

        if (requests.length === 0) {
            console.log("⚠️ No requests returned - showing empty message");
            availableRequestsListElement.innerHTML = `
                <p style="text-align:center; color:#64748b; padding:40px 20px; font-size:1.05rem;">
                    No active requests in your city right now.<br><br>
                    Thank you for being ready to help! 💉
                </p>
            `;
            return;
        }

        console.log("🎉 Rendering cards...");
        availableRequestsListElement.innerHTML = "";
        requests.forEach((req, index) => {
            console.log(`Card ${index + 1}:`, req);
            // ... (rest of your card rendering code remains the same)
            const card = document.createElement("div");
            card.className = "request-card";

            const displayDate = req.date_needed
                ? new Date(req.date_needed).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                })
                : "ASAP";

            card.innerHTML = `
                <div class="badge-container">
                    <div class="blood-type-badge">${req.blood_type}</div>
                </div>
                <div class="card-content">
                    <h3 class="patient-name">${req.recipient_name}</h3>
                    <p class="hospital">
                        <i class="fas fa-hospital-alt"></i> ${req.city}, Bangladesh
                    </p>
                    
                    <div class="details">
                        <div>
                            <span class="label">Reason</span>
                            <span class="value">${req.reason || "Urgent medical need"}</span>
                        </div>
                        <div>
                            <span class="label">Needed by</span>
                            <span class="value">${displayDate}</span>
                        </div>
                    </div>
                    
                    <div class="location">
                        <i class="fas fa-map-marker-alt"></i> ${req.city} Area
                    </div>
                </div>
                <button class="accept-button" data-request-id="${req.request_id}">
                    <i class="fas fa-hand-holding-heart"></i>
                    I Can Help – Accept
                </button>
            `;
            availableRequestsListElement.appendChild(card);
        });
    } catch (err) {
        console.error("❌ Error:", err);
        availableRequestsListElement.innerHTML = `<p style="color:red;">Error: ${err.message}</p>`;
    }
}

// 3. Accepted Requests (Pending Donations)
async function fetchAcceptedRequests() {
    const token = localStorage.getItem("token");
    acceptedRequestsListElement.innerHTML = "<p>Loading accepted requests...</p>";

    try {
        const response = await fetch(`${API_URL}/api/requests/accepted`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const requests = await response.json();
        if (!response.ok) throw new Error(requests.message || "Failed to fetch");

        if (requests.length === 0) {
            acceptedRequestsListElement.innerHTML = "<p>You have no pending accepted requests.</p>";
            return;
        }

        acceptedRequestsListElement.innerHTML = "";
        requests.forEach((req) => {
            const card = document.createElement("div");
            card.className = "request-card";

            card.innerHTML = `
                <div class="badge-container">
                    <div class="blood-type-badge">${req.blood_type}</div>
                </div>
                <div class="card-content">
                    <h3 class="patient-name">${req.recipient_name}</h3>
                    <p class="hospital">
                        <i class="fas fa-hospital-alt"></i> ${req.city}, Bangladesh
                    </p>
                    
                    <div class="details">
                        <div>
                            <span class="label">Reason</span>
                            <span class="value">${req.reason || "Urgent medical need"}</span>
                        </div>
                        <div>
                            <span class="label">Date</span>
                            <span class="value">${new Date(req.date_requested).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})}</span>
                        </div>
                    </div>
                    
                    <div class="location">
                        <i class="fas fa-phone"></i> ${req.recipient_phone || "Contact not provided"}
                    </div>
                </div>
                <button class="delete-button" data-request-id="${req.request_id}">
                    <i class="fas fa-times"></i> Cancel My Acceptance
                </button>
            `;
            acceptedRequestsListElement.appendChild(card);
        });
    } catch (err) {
        console.error("Error fetching accepted requests:", err);
        acceptedRequestsListElement.innerHTML = `<p>Error loading accepted requests: ${err.message}</p>`;
    }
}

// 4. Donation History
// === UPDATED DONATION HISTORY (Daraz compact style) ===
// === PREMIUM DARAZ-STYLE DONATION HISTORY ===
async function fetchDonationHistory() {
    const token = localStorage.getItem("token");
    donationHistoryListElement.innerHTML = "<p>Loading donation history...</p>";

    try {
        const response = await fetch(`${API_URL}/api/donations/myhistory`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const history = await response.json();
        if (!response.ok) throw new Error(history.message || "Failed to fetch");

        if (history.length === 0) {
            donationHistoryListElement.innerHTML = "<p>You have not made any donations yet. Start saving lives today! 💉</p>";
            return;
        }

        donationHistoryListElement.innerHTML = "";
        history.forEach((donation) => {
            const card = document.createElement("div");
            card.className = "request-card history-card";

            card.innerHTML = `
                <div class="badge-container">
                    <div class="blood-type-badge">${donation.blood_type_donated || 'N/A'}</div>
                </div>
                <div class="card-content">
                    <h3 class="patient-name">Donated to ${donation.recipient_name || 'Someone'}</h3>
                    <p class="hospital">
                        <i class="fas fa-hospital-alt"></i> ${donation.request_city || 'Noakhali'}, Bangladesh
                    </p>
                    
                    <div class="details">
                        <div>
                            <span class="label">Donated on</span>
                            <span class="value">${new Date(donation.donation_date).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric' 
                            })}</span>
                        </div>
                    </div>
                    
                    <div class="location">
                        <i class="fas fa-heart"></i> Thank you for saving a life!
                    </div>
                </div>
            `;
            donationHistoryListElement.appendChild(card);
        });
    } catch (err) {
        console.error("Error fetching donation history:", err);
        donationHistoryListElement.innerHTML = `<p>Error loading history: ${err.message}</p>`;
    }
}

// ====================== EVENT LISTENERS (unchanged but now work with new buttons) ======================

// Accept Request
availableRequestsListElement.addEventListener("click", async (event) => {
    if (event.target.classList.contains("accept-button")) {
        const button = event.target;
        const requestId = button.dataset.requestId;
        const token = localStorage.getItem("token");

        if (!requestId || !token) return;

        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Accepting...`;

        try {
            const response = await fetch(`${API_URL}/api/requests/${requestId}/accept`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);

            button.innerHTML = `<i class="fas fa-check"></i> Accepted!`;
            fetchAvailableRequests();
            fetchAcceptedRequests();
        } catch (err) {
            button.innerHTML = `<i class="fas fa-hand-holding-heart"></i> I Can Help – Accept`;
            button.disabled = false;
            alert(`Error: ${err.message}`);
        }
    }
});

// My Requests & Accepted Requests buttons (Delete / Cancel)
[myRequestsListElement, acceptedRequestsListElement].forEach(list => {
    list.addEventListener("click", async (event) => {
        const button = event.target.closest('button');
        if (!button || !button.dataset.requestId) return;

        const requestId = button.dataset.requestId;
        const token = localStorage.getItem("token");
        const isDelete = button.textContent.includes("Delete") || button.textContent.includes("Cancel");

        if (!confirm(isDelete ? "Are you sure?" : "Confirm action?")) return;

        button.disabled = true;
        button.textContent = "Processing...";

        try {
            const method = button.textContent.includes("Delete") ? "DELETE" : "POST";
            const endpoint = button.textContent.includes("Cancel My Acceptance")
                ? `${API_URL}/api/requests/${requestId}/cancel-acceptance`
                : `${API_URL}/api/requests/${requestId}`;

            const response = await fetch(endpoint, {
                method: method,
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!response.ok) throw new Error("Failed");

            fetchMyRequests();
            fetchAcceptedRequests();
            fetchAvailableRequests();
        } catch (err) {
            alert("Action failed. Please try again.");
            button.disabled = false;
            button.textContent = "Retry";
        }
    });
});