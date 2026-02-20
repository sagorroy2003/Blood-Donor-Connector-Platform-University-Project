// toast.js - Global Notification System

function showToast(message, type = 'info') {
    // 1. Check if the container exists. If not, create it on the fly.
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    // 2. Determine the icon based on the type
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';

    // 3. Create the toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;

    // 4. Add it to the screen
    container.appendChild(toast);

    // 5. Trigger the animation (small delay ensures CSS transition works)
    setTimeout(() => toast.classList.add('show'), 10);

    // 6. Remove it automatically after 3.5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        // Wait for slide-out animation to finish before deleting from DOM
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}