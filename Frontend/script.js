// IMPORTANT: Use the full URL of your local backend
const API_URL = "http://localhost:3001";

document.getElementById("test-button").addEventListener("click", async () => {
    const resultsElement = document.getElementById("results");
    resultsElement.textContent = "Loading...";

    try {
        const response = await fetch(`${API_URL}/api/bloodtypes`);
        const data = await response.json();

        // Show the data on the webpage
        resultsElement.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
        resultsElement.textContent =
            "Error connecting to API. Is the backend running?";
        console.error(err);
    }
});
