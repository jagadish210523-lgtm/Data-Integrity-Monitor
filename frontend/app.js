
/* =========================================
   DATA INTEGRITY MONITOR
   APPLICATION JAVASCRIPT
========================================= */

const API = "https://data-integrity-monitor.onrender.com";

let accessToken = localStorage.getItem("access_token");
let refreshToken = localStorage.getItem("refresh_token");
let username = localStorage.getItem("username");

let authMode = "login";
let datasets = [];


// =========================================
// API REQUEST HANDLER
// =========================================

function headers() {
    return accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : {};
}


async function apiRequest(url, options = {}) {

    const response = await fetch(API + url, {
        ...options,
        headers: {
            ...headers(),
            ...(options.headers || {})
        }
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(data?.detail || `Request failed (${response.status})`);
    }

    return data;
}


// =========================================
// AUTHENTICATION
// =========================================

function setAuthMode(mode) {

    authMode = mode;

    document.getElementById("authSubmit").innerHTML =
        mode === "login"
            ? 'Login <span>↗</span>'
            : 'Create account <span>↗</span>';

    document.getElementById("switchLabel").textContent =
        mode === "login"
            ? "Don't have an account?"
            : "Already have an account?";

    document.getElementById("switchAuth").textContent =
        mode === "login" ? "Register" : "Login";

    document.getElementById("authMessage").textContent = "";
    document.getElementById("authMessage").classList.remove("error");
}


// SWITCH LOGIN AND REGISTER

document.getElementById("switchAuth").addEventListener("click", () => {

    setAuthMode(
        authMode === "login" ? "register" : "login"
    );

});


// AUTHENTICATION FORM

document.getElementById("authForm").addEventListener("submit", async (event) => {

    event.preventDefault();

    const usernameValue = document.getElementById("username").value.trim();
    const passwordValue = document.getElementById("password").value;

    const message = document.getElementById("authMessage");
    const button = document.getElementById("authSubmit");

    message.textContent = "";
    message.classList.remove("error");

    button.disabled = true;

    try {

        // REGISTER

        if (authMode === "register") {

            await apiRequest("/Register", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    username: usernameValue,
                    password: passwordValue
                })
            });

            setAuthMode("login");

            document.getElementById("username").value = usernameValue;

            message.textContent =
                "Registration successful. You can now login.";

        }

        // LOGIN

        else {

            const formData = new URLSearchParams();

            formData.append("username", usernameValue);
            formData.append("password", passwordValue);

            const data = await apiRequest("/login", {
                method: "POST",

                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },

                body: formData
            });

            accessToken = data.access_token;
            refreshToken = data.refresh_token;
            username = usernameValue;

            localStorage.setItem("access_token", accessToken);
            localStorage.setItem("refresh_token", refreshToken);
            localStorage.setItem("username", username);

            await showApplication();

        }

    } catch (error) {

        message.textContent = error.message;
        message.classList.add("error");

    } finally {

        button.disabled = false;

    }

});


// =========================================
// LOGOUT
// =========================================

document.getElementById("logoutButton").addEventListener("click", logout);


function logout() {

    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("username");

    accessToken = null;
    refreshToken = null;
    username = null;

    datasets = [];

    document.getElementById("appView").hidden = true;
    document.getElementById("authView").hidden = false;

    document.getElementById("authForm").reset();

    setAuthMode("login");

}


// =========================================
// SHOW APPLICATION
// =========================================

async function showApplication() {

    document.getElementById("authView").hidden = true;
    document.getElementById("appView").hidden = false;

    showView("dashboard");

    try {

        await loadDatasets();

    } catch (error) {

        console.error("Dataset loading error:", error);

    }

}


// =========================================
// NAVIGATION
// =========================================

function showView(viewName) {

    document.querySelectorAll(".view").forEach(section => {

        section.hidden = true;

    });

    const selectedView = document.getElementById(viewName);

    if (!selectedView) return;

    selectedView.hidden = false;

    document.querySelectorAll(".nav-button").forEach(button => {

        button.classList.toggle(
            "active",
            button.dataset.view === viewName
        );

    });

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

}


// NAVIGATION BUTTONS

document.querySelectorAll(".nav-button").forEach(button => {

    button.addEventListener("click", () => {

        showView(button.dataset.view);

    });

});


// QUICK ACTION BUTTONS

document.querySelectorAll("[data-go]").forEach(button => {

    button.addEventListener("click", () => {

        showView(button.dataset.go);

    });

});


// =========================================
// DATASET UPLOAD
// =========================================

document.getElementById("uploadForm").addEventListener("submit", async (event) => {

    event.preventDefault();

    const fileInput = document.getElementById("csvFile");
    const message = document.getElementById("uploadMessage");

    const file = fileInput.files[0];

    if (!file) {

        message.textContent = "Please select a CSV file.";
        message.classList.add("error");

        return;

    }

    if (!file.name.toLowerCase().endsWith(".csv")) {

        message.textContent = "Only CSV files are allowed.";
        message.classList.add("error");

        return;

    }

    if (file.size > 5 * 1024 * 1024) {

        message.textContent = "File size exceeds the 5 MB limit.";
        message.classList.add("error");

        return;

    }

    const formData = new FormData();

    formData.append("file", file);

    message.textContent = "Uploading your dataset...";
    message.classList.remove("error");

    try {

        await apiRequest("/dataset", {
            method: "POST",
            body: formData
        });

        message.textContent = "Dataset uploaded successfully!";

        fileInput.value = "";

        await loadDatasets();

    } catch (error) {

        message.textContent = error.message;
        message.classList.add("error");

    }

});


// =========================================
// LOAD DATASETS
// =========================================

async function loadDatasets() {

    const list = document.getElementById("datasetList");

    try {

        const data = await apiRequest("/datasets");

        datasets = Array.isArray(data) ? data : [];

        renderDatasets();

    } catch (error) {

        if (error.message.toLowerCase().includes("no dataset")) {

            datasets = [];
            renderDatasets();

            return;

        }

        list.textContent = error.message;

        throw error;

    }

}


// =========================================
// RENDER DATASETS
// =========================================

function renderDatasets() {

    const list = document.getElementById("datasetList");

    document.getElementById("datasetCount").textContent =
        datasets.length.toString().padStart(2, "0");

    list.innerHTML = "";

    if (datasets.length === 0) {

        const empty = document.createElement("div");

        empty.className = "empty-state";
        empty.textContent = "No datasets uploaded yet.";

        list.appendChild(empty);

    } else {

        datasets.forEach(dataset => {

            const item = document.createElement("div");

            item.className = "dataset-item";

            const details = document.createElement("div");

            const title = document.createElement("h3");

            title.textContent = dataset.name;

            const info = document.createElement("p");

            info.textContent =
                `Dataset ID: ${dataset.dataset_id}  ·  ${dataset.rows} rows  ·  ${dataset.columns} columns`;

            details.append(title, info);

            const deleteButton = document.createElement("button");

            deleteButton.className = "delete-button";
            deleteButton.textContent = "Delete";

            deleteButton.addEventListener("click", () => {

                deleteDataset(dataset.dataset_id);

            });

            item.append(details, deleteButton);

            list.appendChild(item);

        });

    }

    populateDatasetSelects();

}


// =========================================
// POPULATE DATASET SELECT BOXES
// =========================================

function populateDatasetSelects() {

    const selects = [
        document.getElementById("analysisDataset"),
        document.getElementById("cleanDataset")
    ];

    selects.forEach(select => {

        const previousValue = select.value;

        select.innerHTML =
            '<option value="">Select a dataset</option>';

        datasets.forEach(dataset => {

            const option = document.createElement("option");

            option.value = dataset.dataset_id;
            option.textContent = dataset.name;

            select.appendChild(option);

        });

        if (
            datasets.some(dataset =>
                String(dataset.dataset_id) === previousValue
            )
        ) {

            select.value = previousValue;

        }

    });

}


// =========================================
// SELECTED DATASET DISPLAY
// =========================================

document.getElementById("analysisDataset").addEventListener("change", event => {

    document.getElementById("selectedDataset").textContent =
        event.target.value || "—";

});


// =========================================
// REFRESH DATASETS
// =========================================

document.getElementById("refreshDatasets").addEventListener("click", async () => {

    const button = document.getElementById("refreshDatasets");

    button.disabled = true;

    try {

        await loadDatasets();

    } catch (error) {

        alert(error.message);

    } finally {

        button.disabled = false;

    }

});


// =========================================
// DELETE DATASET
// =========================================

async function deleteDataset(id) {

    const confirmed = confirm(
        "Are you sure you want to delete this dataset?"
    );

    if (!confirmed) return;

    try {

        await apiRequest(`/dataset/${id}`, {
            method: "DELETE"
        });

        await loadDatasets();

        alert("Dataset deleted successfully.");

    } catch (error) {

        alert(error.message);

    }

}


// =========================================
// ANALYZE DATASET
// =========================================

document.getElementById("runAnalysis").addEventListener("click", async () => {

    const id = document.getElementById("analysisDataset").value;

    const results = document.getElementById("analysisResults");

    if (!id) {

        results.textContent = "Please select a dataset.";

        return;

    }

    results.innerHTML = `
        <div class="empty-state">
            <h3>Analyzing your dataset...</h3>
        </div>
    `;

    try {

        const data = await apiRequest(`/dataset/${id}`);

        const totalMissing = Object.values(data.total_nulls || {})
            .reduce((sum, value) => sum + Number(value), 0);

        document.getElementById("selectedDataset").textContent = id;

        document.getElementById("missingCount").textContent =
            totalMissing.toLocaleString();

        results.innerHTML = `
            <div class="content-card">

                <p class="eyebrow">ANALYSIS COMPLETE</p>

                <h2>Dataset insights.</h2>

                <div class="result-grid">

                    <div class="result-card">
                        <h3>Total missing values</h3>
                        <p>${totalMissing.toLocaleString()}</p>
                    </div>

                    <div class="result-card">
                        <h3>Total duplicates</h3>
                        <p>${Number(data.total_duplicates || 0).toLocaleString()}</p>
                    </div>

                    <div class="result-card">
                        <h3>Total columns</h3>
                        <p>${(data.total_columns || []).length}</p>
                    </div>

                    <div class="result-card">
                        <h3>Column count</h3>
                        <p>${Object.keys(data.data_types || {}).length}</p>
                    </div>

                </div>

                <div class="result-card">
                    <h3>Missing values by column</h3>
                    <pre id="nullResults"></pre>
                </div>

                <div class="result-card">
                    <h3>Column data types</h3>
                    <pre id="typeResults"></pre>
                </div>

                <div class="result-card">
                    <h3>Dataset columns</h3>
                    <pre id="columnResults"></pre>
                </div>

                <div class="result-card">
                    <h3>Statistical description</h3>
                    <pre id="descriptionResults"></pre>
                </div>

            </div>
        `;

        document.getElementById("nullResults").textContent =
            JSON.stringify(data.total_nulls || {}, null, 2);

        document.getElementById("typeResults").textContent =
            JSON.stringify(data.data_types || {}, null, 2);

        document.getElementById("columnResults").textContent =
            JSON.stringify(data.total_columns || [], null, 2);

        document.getElementById("descriptionResults").textContent =
            JSON.stringify(data.description || {}, null, 2);

    } catch (error) {

        results.innerHTML = `
            <div class="empty-state">
                <h3>Analysis could not be completed.</h3>
                <p id="analysisError"></p>
            </div>
        `;

        document.getElementById("analysisError").textContent =
            error.message;

    }

});


// =========================================
// LOAD CLEANING PROFILE
// =========================================

document.getElementById("loadCleaning").addEventListener("click", async () => {

    const id = document.getElementById("cleanDataset").value;

    const profile = document.getElementById("cleaningProfile");

    if (!id) {

        profile.textContent = "Please select a dataset.";

        return;

    }

    profile.innerHTML = `
        <div class="empty-state">
            <h3>Inspecting your dataset...</h3>
        </div>
    `;

    try {

        const data = await apiRequest(`/cleaning/${id}`);

        profile.innerHTML = `
            <div class="content-card">

                <p class="eyebrow">DATA QUALITY REPORT</p>

                <h2>Cleaning insights.</h2>

                <div class="result-grid">

                    <div class="result-card">
                        <h3>Total missing values</h3>
                        <p>${data.Total_Missing_Values ?? 0}</p>
                    </div>

                    <div class="result-card">
                        <h3>Total duplicates</h3>
                        <p>${data.Total_duplicates ?? 0}</p>
                    </div>

                </div>

                <div class="result-card">
                    <h3>Missing values by column</h3>
                    <pre id="missingColumns"></pre>
                </div>

                <div class="result-card">
                    <h3>Rows affected by missing values</h3>
                    <pre id="affectedRows"></pre>
                </div>

                <div class="result-card">
                    <h3>Columns containing missing values</h3>
                    <pre id="nullColumns"></pre>
                </div>

                <div class="result-card">
                    <h3>Invalid data</h3>
                    <pre id="invalidData"></pre>
                </div>

            </div>
        `;

        document.getElementById("missingColumns").textContent =
            JSON.stringify(data.Columnwise_null || {}, null, 2);

        document.getElementById("affectedRows").textContent =
            JSON.stringify(data.Rows_affected || [], null, 2);

        document.getElementById("nullColumns").textContent =
            JSON.stringify(data.Total_null_columns || [], null, 2);

        document.getElementById("invalidData").textContent =
            JSON.stringify(data.Invalid_data || {}, null, 2);

    } catch (error) {

        profile.innerHTML = `
            <div class="empty-state">
                <h3>Cleaning profile could not be loaded.</h3>
                <p id="cleaningError"></p>
            </div>
        `;

        document.getElementById("cleaningError").textContent =
            error.message;

    }

});


// =========================================
// CLEANING OPERATION SELECTION
// =========================================

document.getElementById("operation").addEventListener("change", event => {

    const operation = event.target.value;

    document.getElementById("fillFields").hidden =
        operation !== "fill";

    document.getElementById("rangeFields").hidden =
        operation !== "range";

    document.getElementById("numericFields").hidden =
        operation !== "numeric";

});


// =========================================
// INITIAL APPLICATION CHECK
// =========================================

if (accessToken) {

    showApplication();

} else {

    document.getElementById("authView").hidden = false;
    document.getElementById("appView").hidden = true;

    setAuthMode("login");

}