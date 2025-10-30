const API_URL = "https://blood-donor-backend-mj35.onrender.com"

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
        if (!response.ok) {
            throw new Error(data.message);
        }

        // Display Profile
        userNameEl.textContent = data.name;
        userEmailEl.textContent = data.email;
        userPhoneEl.textContent = data.contact_phone;

        // Fetch initial data after profile loads
        populateRequestBloodTypes(); // Populate the form dropdown
        fetchMyRequests();          // Populate 'My Requests' list
        fetchAvailableRequests();   // Populate 'Available Requests' list
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

// --- Populate Blood Types for Request Form ---
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
    if (!token) return window.location.href = "login.html";

    const requestData = {
        city: document.getElementById("request-city").value,
        blood_type_id: requestBloodTypeSelect.value,
        reason: document.getElementById("request-reason").value,
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
        fetchMyRequests(); // Refresh the 'My Requests' list

    } catch (err) {
        requestMessage.textContent = `Error: ${err.message}`;
        requestMessage.style.color = "red";
    }
});

// --- Fetch and Display "My Requests" (Recipient View) ---
async function fetchMyRequests() {
    const token = localStorage.getItem("token");
    myRequestsListElement.innerHTML = '<p>Loading...</p>'; // Show loading state

    try {
        const response = await fetch(`${API_URL}/api/requests/myrequests`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const requests = await response.json();
        if (!response.ok) throw new Error(requests.message || 'Failed to fetch');

        if (requests.length === 0) {
            myRequestsListElement.innerHTML = "<p>You have not created any requests.</p>";
            return;
        }

        myRequestsListElement.innerHTML = ""; // Clear loading/previous content
        requests.forEach((req) => {
            const reqDiv = document.createElement("div");
            reqDiv.className = "request-card";
            let buttonsHTML = "";
            let deleteButtonHTML = "";

            // Show specific action buttons if a donor has been accepted
            if (req.status === 'on_hold') {
                buttonsHTML = `
                    <button class="fulfill-button" data-request-id="${req.request_id}">Mark as Fulfilled</button>
                    <button class="cancel-donor-button" data-request-id="${req.request_id}">Cancel Accepted Donor</button>
                `;
            }

            // Show a "Delete Request" button for any request that isn't already fulfilled
            if (req.status !== 'fulfilled') {
                deleteButtonHTML = `<button class="delete-request-button" data-request-id="${req.request_id}">Delete Request</button>`;
            }

            reqDiv.innerHTML = `
                <strong>Blood Type: ${req.blood_type}</strong> (${req.city})
                <p>Reason: ${req.reason || "N/A"}</p>
                <p>Status: <strong>${req.status}</strong></p>
                <div class="button-group">
                    ${buttonsHTML}
                    ${deleteButtonHTML}
                </div>
                <p class="request-action-message" style="color: green; display: none;"></p>
            `;
            myRequestsListElement.appendChild(reqDiv);
        });

    } catch (err) {
        console.error("Error fetching my requests:", err);
        myRequestsListElement.innerHTML = `<p>Error loading your requests: ${err.message}</p>`;
    }
}

// --- Fetch and Display "Available Requests" (Donor View) ---
async function fetchAvailableRequests() {
    const token = localStorage.getItem("token");
    availableRequestsListElement.innerHTML = '<p>Loading...</p>'; // Show loading state

    try {
        const response = await fetch(`${API_URL}/api/requests/available`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const requests = await response.json();
        if (!response.ok) throw new Error(requests.message || 'Failed to fetch');


        if (requests.length === 0) {
            availableRequestsListElement.innerHTML = "<p>No active requests match your blood type and city. Thank you for checking!</p>";
            return;
        }

        availableRequestsListElement.innerHTML = ""; // Clear loading/previous content
        requests.forEach((req) => {
            const reqDiv = document.createElement("div");
            reqDiv.className = "request-card";
            reqDiv.innerHTML = `
                <strong>${req.recipient_name} needs ${req.blood_type} in ${req.city}</strong>
                <p>Reason: ${req.reason || "N/A"}</p>
                <p>Date Needed: ${new Date(req.date_requested).toLocaleDateString()}</p>
                <button class="accept-button" data-request-id="${req.request_id}">Accept Request</button>
                <p class="accept-message" style="color: green; display: none;"></p>
            `;
            availableRequestsListElement.appendChild(reqDiv);
        });
    } catch (err) {
        console.error("Error fetching available requests:", err);
        availableRequestsListElement.innerHTML = `<p>Error loading available requests: ${err.message}</p>`;
    }
}

// --- Event Listener for "Accept Request" Buttons (Donor Action) ---
availableRequestsListElement.addEventListener("click", async (event) => {
    if (event.target.classList.contains("accept-button")) {
        const button = event.target;
        const requestId = button.dataset.requestId;
        const token = localStorage.getItem("token");
        const messageElement = button.nextElementSibling;

        if (!requestId || !token) return console.error("Missing requestId or token");

        button.disabled = true;
        button.textContent = "Accepting...";
        messageElement.style.display = "none";

        try {
            const response = await fetch(`${API_URL}/api/requests/${requestId}/accept`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);

            button.textContent = "Accepted!";
            messageElement.textContent = result.message;
            messageElement.style.display = "block";
            // Optionally refresh or modify UI further
            fetchAvailableRequests(); // Re-fetch available requests (the accepted one will disappear)
            fetchMyRequests(); // Refresh recipient's view if they are the same user (unlikely but safe)

        } catch (err) {
            console.error("Error accepting request:", err);
            button.textContent = "Accept Request";
            button.disabled = false;
            messageElement.textContent = `Error: ${err.message}`;
            messageElement.style.color = "red";
            messageElement.style.display = "block";
        }
    }
});

// --- Event Listener for "My Requests" List Buttons (Recipient Actions) ---
myRequestsListElement.addEventListener('click', async (event) => {
    const button = event.target;
    const requestId = button.dataset.requestId;
    const token = localStorage.getItem('token');
    
    // Find the message <p> tag inside this card
    const messageElement = button.closest('.request-card').querySelector('.request-action-message');

    if (!requestId || !token) return; // Exit if no request ID or token

    let apiUrl = '';
    let httpMethod = 'POST'; // Default to POST
    let successMessage = '';
    let buttonText = button.textContent; // Store original text
    let isDelete = false;

    // Determine which button was clicked and set API URL
    if (button.classList.contains('cancel-donor-button')) {
        apiUrl = `${API_URL}/api/requests/${requestId}/cancel-donor`;
        successMessage = 'Donor cancellation successful.';
        button.textContent = 'Cancelling...';
    } else if (button.classList.contains('fulfill-button')) {
        apiUrl = `${API_URL}/api/requests/${requestId}/fulfill`;
        successMessage = 'Request marked as fulfilled.';
        button.textContent = 'Marking...';
    } else if (button.classList.contains('delete-request-button')) {
        isDelete = true;
        // Ask for confirmation before deleting
        if (!confirm('Are you sure you want to permanently delete this request? This action cannot be undone.')) {
            return; // Stop if user clicks cancel
        }
        apiUrl = `${API_URL}/api/requests/${requestId}`;
        httpMethod = 'DELETE'; // Use the DELETE method
        successMessage = 'Request deleted successfully.';
        button.textContent = 'Deleting...';
    } else {
        return; // Clicked something else in the list (like text)
    }

    button.disabled = true;
    if (messageElement) messageElement.style.display = 'none';

    try {
        const response = await fetch(apiUrl, {
            method: httpMethod, // Use POST or DELETE
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        // Success! Refresh the list
        fetchMyRequests();

    } catch (err) {
        console.error(`Error processing action:`, err);
        button.textContent = buttonText; // Reset button text on error
        button.disabled = false;
        if (messageElement) {
            messageElement.textContent = `Error: ${err.message}`;
            messageElement.style.color = 'red';
            messageElement.style.display = 'block';
        }
    }
});


// --- NEW: FUNCTION TO FETCH DONATION HISTORY ---
async function fetchDonationHistory() {
    const token = localStorage.getItem("token");
    donationHistoryListElement.innerHTML = '<p>Loading...</p>';

    try {
        const response = await fetch(`${API_URL}/api/donations/myhistory`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const history = await response.json();
        if (!response.ok) throw new Error(history.message || 'Failed to fetch');

        if (history.length === 0) {
            donationHistoryListElement.innerHTML = "<p>You have not made any donations yet.</p>";
            return;
        }

        donationHistoryListElement.innerHTML = ""; // Clear loading
        history.forEach(donation => {
            const div = document.createElement('div');
            div.className = 'history-card'; // For styling
            div.innerHTML = `
                <p>
                    Donated <strong>${donation.blood_type_donated || 'N/A'}</strong> 
                    to <strong>${donation.recipient_name}</strong> 
                    in ${donation.request_city || 'N/A'} 
                    on <strong>${new Date(donation.donation_date).toLocaleDateString()}</strong>.
                </p>
            `;
            donationHistoryListElement.appendChild(div);
        });

    } catch (err) {
        console.error("Error fetching donation history:", err);
        donationHistoryListElement.innerHTML = `<p>Error loading donation history: ${err.message}</p>`;
    }
}

// --- NEW: FUNCTION TO FETCH ACCEPTED/PENDING REQUESTS ---
async function fetchAcceptedRequests() {
    const token = localStorage.getItem("token");
    acceptedRequestsListElement.innerHTML = '<p>Loading...</p>';

    try {
        const response = await fetch(`${API_URL}/api/requests/accepted`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const requests = await response.json();
        if (!response.ok) throw new Error(requests.message || 'Failed to fetch');

        if (requests.length === 0) {
            acceptedRequestsListElement.innerHTML = "<p>You have no pending accepted requests.</p>";
            return;
        }

        acceptedRequestsListElement.innerHTML = ""; // Clear loading
        requests.forEach(req => {
            const div = document.createElement('div');
            div.className = 'request-card accepted-card'; // Add specific class
            div.innerHTML = `
                <strong>${req.recipient_name} needs ${req.blood_type} in ${req.city}</strong>
                <p>Reason: ${req.reason || "N/A"}</p>
                <p>Date Requested: ${new Date(req.date_requested).toLocaleDateString()}</p>
                <p><strong>Recipient Contact: ${req.recipient_phone || 'Not Provided'}</strong></p> 
                <p>Status: Awaiting Donation (Request is ${req.request_status})</p>
                <button class="cancel-acceptance-button" data-request-id="${req.request_id}">Cancel My Acceptance</button>
                <p class="request-action-message" style="color: green; display: none;"></p> 
            `; // Added recipient phone and cancel button
            acceptedRequestsListElement.appendChild(div);
        });

    } catch (err) {
        console.error("Error fetching accepted requests:", err);
        acceptedRequestsListElement.innerHTML = `<p>Error loading accepted requests: ${err.message}</p>`;
    }
}

// --- NEW: EVENT LISTENER FOR DONOR TO CANCEL THEIR ACCEPTANCE ---
acceptedRequestsListElement.addEventListener('click', async (event) => {
    if (event.target.classList.contains('cancel-acceptance-button')) {
        const button = event.target;
        const requestId = button.dataset.requestId;
        const token = localStorage.getItem('token');
        const messageElement = button.nextElementSibling;

        if (!requestId || !token) return;

        button.disabled = true;
        button.textContent = 'Cancelling...';
        if (messageElement) messageElement.style.display = 'none';

        try {
            const response = await fetch(`${API_URL}/api/requests/${requestId}/cancel-acceptance`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);

            // Success! Refresh relevant lists
            fetchAcceptedRequests(); // Refresh this list (item will disappear)
            fetchAvailableRequests(); // Refresh available list (item might reappear if eligible)

        } catch (err) {
            console.error("Error cancelling acceptance:", err);
            button.textContent = 'Cancel My Acceptance';
            button.disabled = false;
            if (messageElement) {
                messageElement.textContent = `Error: ${err.message}`;
                messageElement.style.color = 'red';
                messageElement.style.display = 'block';
            }
        }
    }
});