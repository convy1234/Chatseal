// Global state management
const AppState = {
    user: {
        name: '',
        picture: ''
    },
    currentPage: 'dashboard'
};

// Initialize app
function initApp() {
    loadUserProfile();
    setupNavigation();
    setupEventListeners();
}

// Load user profile from URL parameters
function loadUserProfile() {
    const params = new URLSearchParams(window.location.search);
    const name = params.get('name') || 'User';
    const picture = params.get('picture') || '';
    
    AppState.user = { name, picture };
    
    // Update UI elements if they exist
    const userNameElements = document.querySelectorAll('#userName, #topbarName');
    userNameElements.forEach(el => {
        if (el) el.textContent = name;
    });
    
    const profilePics = document.querySelectorAll('#profilePic, #topbarPic');
    profilePics.forEach(el => {
        if (el && picture) el.src = picture;
    });
}

// Navigation between pages
function navigateTo(page) {
    const pages = ['dashboard', 'facebook', 'instagram', 'whatsapp', 'customers', 'settings'];
    const currentPath = window.location.pathname;
    
    if (currentPath.includes(`${page}.html`)) {
        return; // Already on the page
    }
    
    // Build new URL with current parameters
    const urlParams = new URLSearchParams(window.location.search);
    window.location.href = `${page}.html?${urlParams.toString()}`;
}

// API utility function
async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(endpoint, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`API Call failed for ${endpoint}:`, error);
        throw error;
    }
}

// Show loading state
function showLoading(element) {
    if (element) {
        element.innerHTML = '<div class="loading-spinner"></div>';
    }
}

// Format date
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);