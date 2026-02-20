// dashboard.js - PROFESSIONAL REFACTOR (Feb 2026)
// Features: Robust event delegation, class-based routing, Toast notifications, and safe DOM manipulation.

const API_URL = "https://blood-donor-backend-mj35.onrender.com";

// --- DOM Elements ---
const userNameEl = document.getElementById("user-name");
const userEmailEl = document.getElementById("user-email");
const userPhoneEl = document.getElementById("user-phone");
const logoutButton = document.getElementById("logout-button");
const requestForm = document.getElementById("request-form");
const requestBloodTypeSelect = document.getElementById("request-blood-type");
const myRequestsListElement = document.getElementById("my-requests-list");
const availableRequestsListElement = document.getElementById("available-requests-list");
const donationHistoryListElement = document.getElementById("donation-history-list");
const acceptedRequestsListElement = document.getElementById("accepted-requests-list");

// --- UI Enhancements (Moved from HTML) ---
const hamburger = document.querySelector('.hamburger');
const navLinks = document.querySelector('.nav-links');
if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        hamburger.classList.toggle('open');
    });
}

const dateInput = document.getElementById('request-date');
if (dateInput) {
    dateInput.setAttribute('min', new Date().toISOString().split('T')[0]);
}

// --- 1. Initialization ---
(async function initDashboard() {
    const token = localStorage.getItem("token");
    if (!token) {
        window.location.href = "login.html";
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/profile`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        
        if (!response.ok) throw new Error("Session expired");
        const data = await response.json();

        // Populate Top Bar
        userNameEl.textContent = data.name;
        userEmailEl.textContent = data.email;
        userPhoneEl.textContent = data.contact_phone || "N/A";

        // Trigger Data Loaders
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

// --- 2. Auth & Form Actions ---
logoutButton.addEventListener("click", () => {
    localStorage.removeItem("token");
    window.location.href = "login.html";
});

async function populateRequestBloodTypes() {
    try {
        const response = await fetch(`${API_URL}/api/bloodtypes`);
        const bloodTypes = await response.json();
        requestBloodTypeSelect.innerHTML = '<option value="">-- Select Blood Type --</option>';
        bloodTypes.forEach((bt) => {
            requestBloodTypeSelect.insertAdjacentHTML('beforeend', `<option value="${bt.blood_type_id}">${bt.type}</option>`);
        });
    } catch (err) {
        requestBloodTypeSelect.innerHTML = '<option value="">Failed to load</option>';
    }
}

// Create New Request
requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = localStorage.getItem("token");

    const requestData = {
        city: document.getElementById("request-city").value,
        blood_type_id: requestBloodTypeSelect.value,
        reason: document.getElementById("request-reason").value,
        date_needed: document.getElementById("request-date").value,
    };

    const submitBtn = requestForm.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Submitting...`;
    submitBtn.disabled = true;

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

        // Replace raw text with beautiful toast
        if (typeof showToast === "function") {
            showToast("Blood request created successfully!", "success");
        }
        
        requestForm.reset();
        
        // Refresh grids
        fetchMyRequests();
        fetchAvailableRequests(); 
    } catch (err) {
        if (typeof showToast === "function") {
            showToast(err.message, "error");
        }
    } finally {
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
    }
});

// ====================== FETCHING DATA ======================

async function fetchMyRequests() {
    const token = localStorage.getItem("token");
    myRequestsListElement.innerHTML = "<div class='loading-state'><i class='fas fa-spinner fa-spin'></i><p>Loading your requests...</p></div>";

    try {
        const response = await fetch(`${API_URL}/api/requests/myrequests`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const requests = await response.json();
        if (!response.ok) throw new Error(requests.message);

        if (requests.length === 0) {
            myRequestsListElement.innerHTML = "<p class='empty-state'>You have not created any requests yet.</p>";
            return;
        }

        myRequestsListElement.innerHTML = requests.map(req => {
            let actionButtons = '';

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

            if (req.status !== "fulfilled") {
                actionButtons += `
                    <button class="delete-button delete-request-button" data-request-id="${req.request_id}">
                        <i class="fas fa-trash"></i> Delete Request
                    </button>
                `;
            }

            return createCardHTML(req, actionButtons, "My Request");
        }).join('');
    } catch (err) {
        myRequestsListElement.innerHTML = `<p class="error-msg">Error loading requests: ${err.message}</p>`;
    }
}

async function fetchAvailableRequests() {
    const token = localStorage.getItem("token");
    availableRequestsListElement.innerHTML = "<div class='loading-state'><i class='fas fa-spinner fa-spin'></i><p>Loading available requests near you...</p></div>";

    try {
        const response = await fetch(`${API_URL}/api/requests/available`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        const requests = Array.isArray(data) ? data : (data.requests || []);

        if (requests.length === 0) {
            availableRequestsListElement.innerHTML = `<p class='empty-state'>No active requests in your city right now.<br>Thank you for being ready to help! 💉</p>`;
            return;
        }

        availableRequestsListElement.innerHTML = requests.map(req => {
            const actionBtn = `
                <button class="accept-button donor-accept-button" data-request-id="${req.request_id}">
                    <i class="fas fa-hand-holding-heart"></i> I Can Help – Accept
                </button>`;
            return createCardHTML(req, actionBtn, req.recipient_name);
        }).join('');
    } catch (err) {
        availableRequestsListElement.innerHTML = `<p class="error-msg">Error: ${err.message}</p>`;
    }
}

async function fetchAcceptedRequests() {
    const token = localStorage.getItem("token");
    acceptedRequestsListElement.innerHTML = "<div class='loading-state'><i class='fas fa-spinner fa-spin'></i><p>Loading accepted requests...</p></div>";

    try {
        const response = await fetch(`${API_URL}/api/requests/accepted`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const requests = await response.json();

        if (requests.length === 0) {
            acceptedRequestsListElement.innerHTML = "<p class='empty-state'>You have no pending accepted requests.</p>";
            return;
        }

        acceptedRequestsListElement.innerHTML = requests.map(req => {
            const actionBtn = `
                <button class="delete-button cancel-acceptance-button" data-request-id="${req.request_id}">
                    <i class="fas fa-times"></i> Cancel My Acceptance
                </button>`;
            req.extraDetail = `<div class="location"><i class="fas fa-phone"></i> ${req.recipient_phone || "Contact not provided"}</div>`;
            return createCardHTML(req, actionBtn, req.recipient_name);
        }).join('');
    } catch (err) {
        acceptedRequestsListElement.innerHTML = `<p class="error-msg">Error loading accepted requests: ${err.message}</p>`;
    }
}

async function fetchDonationHistory() {
    const token = localStorage.getItem("token");
    donationHistoryListElement.innerHTML = "<div class='loading-state'><i class='fas fa-spinner fa-spin'></i><p>Loading donation history...</p></div>";

    try {
        const response = await fetch(`${API_URL}/api/donations/myhistory`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const history = await response.json();

        if (history.length === 0) {
            donationHistoryListElement.innerHTML = "<p class='empty-state'>You have not made any donations yet. Start saving lives today! 💉</p>";
            return;
        }

        donationHistoryListElement.innerHTML = history.map(donation => `
            <div class="request-card history-card">
                <div class="badge-container">
                    <div class="blood-type-badge">${donation.blood_type_donated || 'N/A'}</div>
                </div>
                <div class="card-content">
                    <h3 class="patient-name">Donated to ${donation.recipient_name || 'Someone'}</h3>
                    <p class="hospital"><i class="fas fa-hospital-alt"></i> ${donation.request_city || 'Noakhali'}, Bangladesh</p>
                    <div class="details">
                        <div>
                            <span class="label">Donated on</span>
                            <span class="value">${new Date(donation.donation_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                    </div>
                    <div class="location"><i class="fas fa-heart"></i> Thank you for saving a life!</div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        donationHistoryListElement.innerHTML = `<p class="error-msg">Error loading history: ${err.message}</p>`;
    }
}

// --- Reusable HTML Card Generator ---
function createCardHTML(req, buttonsHTML, title) {
    const displayDate = req.date_needed 
        ? new Date(req.date_needed).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) 
        : "ASAP";
    
    return `
        <div class="request-card">
            <div class="badge-container">
                <div class="blood-type-badge">${req.blood_type}</div>
            </div>
            <div class="card-content">
                <h3 class="patient-name">${title}</h3>
                <p class="hospital"><i class="fas fa-hospital-alt"></i> ${req.city}, Bangladesh</p>
                <div class="details">
                    <div>
                        <span class="label">Reason</span>
                        <span class="value reason-text">${req.reason || "Urgent medical need"}</span>
                    </div>
                    <div>
                        <span class="label">Needed</span>
                        <span class="value">${displayDate}</span>
                    </div>
                </div>
                ${req.extraDetail || `<div class="location"><i class="fas fa-map-marker-alt"></i> Posted ${new Date(req.date_requested || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>`}
            </div>
            <div class="button-group" style="padding: 0 16px 16px; display: flex; flex-direction: column; gap: 10px;">
                ${buttonsHTML}
            </div>
        </div>
    `;
}

// ====================== UNIFIED EVENT ROUTER ======================

document.addEventListener("click", async (event) => {
    const button = event.target.closest('button');
    if (!button || !button.dataset.requestId) return;

    const requestId = button.dataset.requestId;
    const token = localStorage.getItem("token");
    let endpoint = "";
    let method = "POST";
    let confirmMsg = "";

    if (button.classList.contains("donor-accept-button")) {
        endpoint = `${API_URL}/api/requests/${requestId}/accept`;
        confirmMsg = "Accept this request? The recipient will be notified.";
    } else if (button.classList.contains("delete-request-button")) {
        endpoint = `${API_URL}/api/requests/${requestId}`;
        method = "DELETE";
        confirmMsg = "Permanently delete this request?";
    } else if (button.classList.contains("cancel-acceptance-button")) {
        endpoint = `${API_URL}/api/requests/${requestId}/cancel-acceptance`;
        confirmMsg = "Withdraw your offer to donate? The request will become public again.";
    } else if (button.classList.contains("cancel-donor-button")) {
        endpoint = `${API_URL}/api/requests/${requestId}/cancel-donor`;
        confirmMsg = "Cancel this donor? They will be notified and the request will become public.";
    } else if (button.classList.contains("fulfill-button")) {
        endpoint = `${API_URL}/api/requests/${requestId}/fulfill`;
        confirmMsg = "Mark as fulfilled? This will update the donor's history.";
    } else {
        return; 
    }

    if (!confirm(confirmMsg)) return;

    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processing...`;

    try {
        const response = await fetch(endpoint, {
            method: method,
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || "Action failed");
        }

        if (typeof showToast === "function") {
            showToast("Action completed successfully!", "success");
        }

        fetchMyRequests();
        fetchAvailableRequests();
        fetchAcceptedRequests();
        fetchDonationHistory();
        
    } catch (err) {
        if (typeof showToast === "function") {
            showToast(`Failed: ${err.message}`, "error");
        } else {
            alert(`Failed: ${err.message}`);
        }
        button.innerHTML = originalText;
        button.disabled = false;
    }
});