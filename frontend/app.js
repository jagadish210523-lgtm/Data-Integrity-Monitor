
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

let refreshPromise = null;


// =========================================
// DOM HELPER
// =========================================

function getElement(id) {
    return document.getElementById(id);
}


// =========================================
// AUTHENTICATION STATE
// =========================================

function saveTokens(access, refresh = null) {

    accessToken = access;

    localStorage.setItem("access_token", accessToken);

    if (refresh) {
        refreshToken = refresh;
        localStorage.setItem("refresh_token", refreshToken);
    }
}


function clearSession() {

    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("username");

    accessToken = null;
    refreshToken = null;
    username = null;

    datasets = [];
}


// =========================================
// REQUEST HEADERS
// =========================================

function headers() {

    return accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : {};
}


// =========================================
// REFRESH ACCESS TOKEN
// POST /refresh
// =========================================

async function refreshAccessToken() {

    if (!refreshToken) {
        throw new Error("Your session has expired. Please login again.");
    }

    if (refreshPromise) {
        return refreshPromise;
    }

    refreshPromise = (async () => {

        const response = await fetch(`${API}/refresh`, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                refresh_token: refreshToken
            })

        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {

            throw new Error(
                data?.detail || "Unable to refresh your session."
            );

        }

        if (!data?.access_token) {

            throw new Error("The refresh endpoint did not return an access token.");

        }

        // Backend returns only a new access token.
        saveTokens(data.access_token);

        return accessToken;

    })();

    try {

        return await refreshPromise;

    } finally {

        refreshPromise = null;

    }
}


// =========================================
// API REQUEST HANDLER
// =========================================

async function apiRequest(url, options = {}, retry = true) {

    const requestOptions = { ...options };

    const requestHeaders = {
        ...headers(),
        ...(requestOptions.headers || {})
    };

    // Let the browser generate the multipart boundary.
    if (requestOptions.body instanceof FormData) {
        delete requestHeaders["Content-Type"];
    }

    const response = await fetch(`${API}${url}`, {

        ...requestOptions,

        headers: requestHeaders

    });

    const data = await response.json().catch(() => null);

    // Refresh expired access tokens and retry the request.
    if (
        response.status === 401 &&
        retry &&
        refreshToken &&
        url !== "/login" &&
        url !== "/Register" &&
        url !== "/refresh"
    ) {

        try {

            await refreshAccessToken();

            return await apiRequest(url, options, false);

        } catch (error) {

            logout();

            throw new Error(
                "Your session has expired. Please login again."
            );

        }
    }

    if (!response.ok) {

        throw new Error(
            data?.detail ||
            data?.message ||
            `Request failed (${response.status})`
        );

    }

    return data;
}


// =========================================
// PASSWORD VISIBILITY TOGGLE
// =========================================

if (getElement("togglePassword")) {

    getElement("togglePassword").addEventListener("click", () => {

        const password = getElement("password");
        const toggle = getElement("togglePassword");
        const eyeIcon = getElement("eyeIcon");

        const isHidden = password.type === "password";

        password.type = isHidden ? "text" : "password";

        toggle.setAttribute(
            "aria-label",
            isHidden ? "Hide password" : "Show password"
        );

        toggle.setAttribute(
            "title",
            isHidden ? "Hide password" : "Show password"
        );

        eyeIcon.innerHTML = isHidden
            ? `
                <path d="M3 3l18 18"/>
                <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/>
                <path d="M9.9 5.2A11 11 0 0 1 12 5c6.4 0 10 7 10 7a15.8 15.8 0 0 1-4 4.9"/>
                <path d="M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1.1 0 2.1-.2 3-.5"/>
              `
            : `
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/>
                <circle cx="12" cy="12" r="3"/>
              `;

    });

}


// =========================================
// AUTHENTICATION MODE
// =========================================

function setAuthMode(mode) {

    authMode = mode;

    if (getElement("authSubmit")) {

        getElement("authSubmit").innerHTML =
            mode === "login"
                ? 'Login <span>↗</span>'
                : 'Create account <span>↗</span>';

    }

    if (getElement("switchLabel")) {

        getElement("switchLabel").textContent =
            mode === "login"
                ? "Don't have an account?"
                : "Already have an account?";

    }

    if (getElement("switchAuth")) {

        getElement("switchAuth").textContent =
            mode === "login" ? "Register" : "Login";

    }

    if (getElement("authMessage")) {

        getElement("authMessage").textContent = "";
        getElement("authMessage").classList.remove("error");

    }
}


// =========================================
// SWITCH LOGIN / REGISTER
// =========================================

if (getElement("switchAuth")) {

    getElement("switchAuth").addEventListener("click", () => {

        setAuthMode(
            authMode === "login" ? "register" : "login"
        );

    });

}


// =========================================
// REGISTER AND LOGIN
// =========================================

if (getElement("authForm")) {

    getElement("authForm").addEventListener("submit", async (event) => {

        event.preventDefault();

        const usernameValue = getElement("username").value.trim();
        const passwordValue = getElement("password").value;

        const message = getElement("authMessage");
        const button = getElement("authSubmit");

        message.textContent = "";
        message.classList.remove("error");

        button.disabled = true;

        try {

            if (!usernameValue || !passwordValue) {
                throw new Error("Please enter your username and password.");
            }

            // REGISTER
            if (authMode === "register") {

                const data = await apiRequest("/Register", {

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

                getElement("username").value = usernameValue;

                message.textContent =
                    data?.message || "Registration successful. You can now login.";

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

                if (!data.access_token || !data.refresh_token) {
                    throw new Error("Login response is missing authentication tokens.");
                }

                saveTokens(
                    data.access_token,
                    data.refresh_token
                );

                username = usernameValue;

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

}


// =========================================
// LOGOUT
// =========================================

if (getElement("logoutButton")) {

    getElement("logoutButton").addEventListener("click", logout);

}


function logout() {

    clearSession();

    if (getElement("appView")) {
        getElement("appView").hidden = true;
    }

    if (getElement("authView")) {
        getElement("authView").hidden = false;
    }

    if (getElement("authForm")) {
        getElement("authForm").reset();
    }

    setAuthMode("login");

}


// =========================================
// SHOW APPLICATION
// =========================================

async function showApplication() {

    getElement("authView").hidden = true;
    getElement("appView").hidden = false;

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

    const selectedView = getElement(viewName);

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
// POST /dataset
// =========================================

if (getElement("uploadForm")) {

    getElement("uploadForm").addEventListener("submit", async (event) => {

        event.preventDefault();

        const fileInput = getElement("csvFile");
        const message = getElement("uploadMessage");

        const file = fileInput.files[0];

        message.textContent = "";
        message.classList.remove("error");

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

        try {

            const data = await apiRequest("/dataset", {

                method: "POST",
                body: formData

            });

            message.textContent =
                data?.message || "Dataset uploaded successfully!";

            fileInput.value = "";

            await loadDatasets();

        } catch (error) {

            message.textContent = error.message;
            message.classList.add("error");

        }

    });

}


// =========================================
// LOAD DATASETS
// GET /datasets
// =========================================

async function loadDatasets() {

    const list = getElement("datasetList");

    try {

        const data = await apiRequest("/datasets");

        datasets = Array.isArray(data) ? data : [];

        renderDatasets();

    } catch (error) {

        // Backend returns 404 when no datasets exist.
        if (error.message.toLowerCase().includes("no dataset")) {

            datasets = [];
            renderDatasets();

            return;

        }

        if (list) {
            list.textContent = error.message;
        }

        throw error;

    }

}


// =========================================
// RENDER DATASETS
// =========================================

function renderDatasets() {

    const list = getElement("datasetList");

    if (!list) return;

    if (getElement("datasetCount")) {

        getElement("datasetCount").textContent =
            datasets.length.toString().padStart(2, "0");

    }

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
                `Dataset ID: ${dataset.dataset_id} · ${dataset.rows} rows · ${dataset.columns} columns`;

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
        getElement("analysisDataset"),
        getElement("cleanDataset")
    ];

    selects.forEach(select => {

        if (!select) return;

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

if (getElement("analysisDataset")) {

    getElement("analysisDataset").addEventListener("change", event => {

        if (getElement("selectedDataset")) {

            getElement("selectedDataset").textContent =
                event.target.value || "—";

        }

    });

}


// =========================================
// REFRESH DATASETS
// =========================================

if (getElement("refreshDatasets")) {

    getElement("refreshDatasets").addEventListener("click", async () => {

        const button = getElement("refreshDatasets");

        button.disabled = true;

        try {

            await loadDatasets();

        } catch (error) {

            alert(error.message);

        } finally {

            button.disabled = false;

        }

    });

}


// =========================================
// DELETE DATASET
// DELETE /dataset/{dataset_id}
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
// GET /dataset/{dataset_id}
// =========================================

if (getElement("runAnalysis")) {

    getElement("runAnalysis").addEventListener("click", async () => {

        const id = getElement("analysisDataset").value;

        const results = getElement("analysisResults");

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

            if (getElement("selectedDataset")) {
                getElement("selectedDataset").textContent = id;
            }

            if (getElement("missingCount")) {
                getElement("missingCount").textContent =
                    totalMissing.toLocaleString();
            }

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

                    <div class="result-card">
                        <h3>Unique values by column</h3>
                        <pre id="uniqueResults"></pre>
                    </div>

                    <div class="result-card">
                        <h3>Non-null values by column</h3>
                        <pre id="nonNullResults"></pre>
                    </div>

                </div>

            `;

            getElement("nullResults").textContent =
                JSON.stringify(data.total_nulls || {}, null, 2);

            getElement("typeResults").textContent =
                JSON.stringify(data.data_types || {}, null, 2);

            getElement("columnResults").textContent =
                JSON.stringify(data.total_columns || [], null, 2);

            getElement("descriptionResults").textContent =
                JSON.stringify(data.description || {}, null, 2);

            getElement("uniqueResults").textContent =
                JSON.stringify(data.unique_columns || {}, null, 2);

            getElement("nonNullResults").textContent =
                JSON.stringify(data.non_null || {}, null, 2);

        } catch (error) {

            results.innerHTML = `

                <div class="empty-state">

                    <h3>Analysis could not be completed.</h3>

                    <p id="analysisError"></p>

                </div>

            `;

            getElement("analysisError").textContent = error.message;

        }

    });

}


// =========================================
// LOAD CLEANING PROFILE
// GET /cleaning/{dataset_id}
// =========================================

async function loadCleaningProfile(datasetId) {

    const profile = getElement("cleaningProfile");

    if (!datasetId) {
        profile.textContent = "Please select a dataset.";
        return;
    }

    profile.innerHTML = `
        <div class="empty-state">
            <h3>Inspecting your dataset...</h3>
        </div>
    `;

    try {

        const data = await apiRequest(`/cleaning/${datasetId}`);

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
                    <h3>Duplicate rows</h3>
                    <pre id="duplicateRows"></pre>
                </div>
                <div class="result-card">
                    <h3>Invalid data</h3>
                    <pre id="invalidData"></pre>
                </div>
                <div class="result-card">
                    <h3>Invalid data types</h3>
                    <pre id="invalidTypes"></pre>
                </div>
            </div>
        `;

        getElement("missingColumns").textContent =
            JSON.stringify(data.Columnwise_null || {}, null, 2);
        getElement("affectedRows").textContent =
            JSON.stringify(data.Rows_affected || [], null, 2);
        getElement("nullColumns").textContent =
            JSON.stringify(data.Total_null_columns || [], null, 2);
        getElement("duplicateRows").textContent =
            JSON.stringify(data.Row_duplicates || [], null, 2);
        getElement("invalidData").textContent =
            JSON.stringify(data.Invalid_data || {}, null, 2);
        getElement("invalidTypes").textContent =
            JSON.stringify(data.Invalid_datatype || {}, null, 2);

    } catch (error) {

        profile.innerHTML = `
            <div class="empty-state">
                <h3>Cleaning profile could not be loaded.</h3>
                <p id="cleaningError"></p>
            </div>
        `;
        getElement("cleaningError").textContent = error.message;

    }
}

if (getElement("loadCleaning")) {
    getElement("loadCleaning").addEventListener("click", async () => {
        const id = getElement("cleanDataset").value;
        resetDownloadState();
        await loadCleaningProfile(id);
    });
}


// =========================================
// CLEANING REQUEST
// POST /applied_cleaning/{dataset_id}
// =========================================

async function applyCleaning(datasetId, request, range) {

    if (!datasetId) {
        throw new Error("Please select a dataset.");
    }

    if (!request) {
        throw new Error("Cleaning request is required.");
    }

    return await apiRequest(`/applied_cleaning/${datasetId}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            request: {
                selected_columns: request.selected_columns || [],
                selected_rows: request.selected_rows || [],
                fill_method: request.fill_method,
                user_val: request.fill_method === "custom"
                    ? Number(request.user_val)
                    : null
            },
            range: range ? {
                column: range.column,
                min_value: Number(range.min_value),
                max_value: Number(range.max_value)
            } : null
        })
    });
}

window.applyCleaning = applyCleaning;


// =========================================
// CLEANING FORM HELPERS
// =========================================

let cleanedDatasetId = null;

function setCleaningMessage(message, isError = false) {
    const element = getElement("cleaningActionMessage");
    if (!element) return;

    element.textContent = message;
    element.classList.toggle("error", isError);
}

function resetDownloadState() {
    cleanedDatasetId = null;

    const button = getElement("downloadCleanedButton");
    if (button) button.disabled = true;
}

function parseCommaSeparated(value) {
    if (!value.trim()) return [];

    return value.split(",")
        .map(item => item.trim())
        .filter(Boolean);
}

function updateFillMethodFields() {
    const method = getElement("fillMethod")?.value;
    const customField = getElement("customValueField");

    if (customField) {
        customField.hidden = method !== "custom";
    }

    const fillValue = getElement("fillValue");
    if (fillValue) {
        fillValue.required = method === "custom";
    }
}

if (getElement("fillMethod")) {
    getElement("fillMethod").addEventListener("change", updateFillMethodFields);
    updateFillMethodFields();
}

if (getElement("cleanDataset")) {
    getElement("cleanDataset").addEventListener("change", () => {
        resetDownloadState();
        setCleaningMessage("");
    });
}


// =========================================
// APPLY CLEANING BUTTON
// =========================================

if (getElement("applyCleaningButton")) {

    getElement("applyCleaningButton").addEventListener("click", async () => {

        const datasetId = getElement("cleanDataset").value;
        const method = getElement("fillMethod").value;
        const columns = parseCommaSeparated(getElement("columnsInput").value);
        const rows = parseCommaSeparated(getElement("rowsInput").value);
        const rangeColumn = getElement("rangeColumn").value.trim();
        const minRaw = getElement("minValue").value.trim();
        const maxRaw = getElement("maxValue").value.trim();
        const customRaw = getElement("fillValue").value.trim();
        const button = getElement("applyCleaningButton");

        setCleaningMessage("");
        resetDownloadState();

        try {

            if (!datasetId) {
                throw new Error("Please select a dataset first.");
            }

            if (columns.length === 0) {
                throw new Error("Enter at least one column to clean.");
            }

            if (rows.length === 0) {
                throw new Error("Enter at least one zero-based row index to clean.");
            }

            if (rows.some(row => !/^\d+$/.test(row))) {
                throw new Error("Rows must be zero-based whole-number indexes separated by commas.");
            }

            if (method === "custom" && customRaw === "") {
                throw new Error("Enter the custom fill value.");
            }

            if (method === "custom" && !Number.isFinite(Number(customRaw))) {
                throw new Error("The custom fill value must be numeric.");
            }

            // Range validation is optional. Validate it only when the user
            // has entered at least one of its three fields.
            let rangePayload = null;
            const hasAnyRangeValue =
                rangeColumn !== "" || minRaw !== "" || maxRaw !== "";

            if (hasAnyRangeValue) {

                if (!rangeColumn || minRaw === "" || maxRaw === "") {
                    throw new Error(
                        "To use range validation, enter the column, minimum, and maximum values."
                    );
                }

                const minValue = Number(minRaw);
                const maxValue = Number(maxRaw);

                if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
                    throw new Error("Minimum and maximum values must be valid numbers.");
                }

                if (minValue > maxValue) {
                    throw new Error("Minimum value cannot be greater than maximum value.");
                }

                rangePayload = {
                    column: rangeColumn,
                    min_value: minValue,
                    max_value: maxValue
                };
            }

            button.disabled = true;
            button.textContent = "Applying cleaning...";
            setCleaningMessage("Cleaning your dataset. Please wait...");

            await applyCleaning(
                datasetId,
                {
                    selected_columns: columns,
                    selected_rows: rows,
                    fill_method: method,
                    user_val: method === "custom" ? Number(customRaw) : null
                },
                rangePayload
            );

            cleanedDatasetId = String(datasetId);
            getElement("downloadCleanedButton").disabled = false;
            setCleaningMessage("Cleaning completed successfully. You can now download the cleaned CSV.");

            try {
                await loadCleaningProfile(datasetId);
                await loadDatasets();
            } catch (refreshError) {
                console.error("Cleaning succeeded, but refreshing the page data failed:", refreshError);
            }

        } catch (error) {

            setCleaningMessage(error.message, true);

        } finally {

            button.disabled = false;
            button.innerHTML = 'Apply cleaning <span>↗</span>';

        }

    });
}

// =========================================
// DOWNLOAD CLEANED DATASET
// GET /dataset/{dataset_id}/download
// =========================================

async function downloadCleanedDataset(datasetId) {

    if (!datasetId) {
        throw new Error("No successfully cleaned dataset is available to download.");
    }

    async function sendDownloadRequest(retry = true) {

        const response = await fetch(`${API}/dataset/${datasetId}/download`, {
            method: "GET",
            headers: headers()
        });

        if (response.status === 401 && retry && refreshToken) {
            try {
                await refreshAccessToken();
                return await sendDownloadRequest(false);
            } catch (error) {
                logout();
                throw new Error("Your session has expired. Please login again.");
            }
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(
                errorData?.detail || `Download failed (${response.status}).`
            );
        }

        return response;
    }

    const response = await sendDownloadRequest();
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const disposition = response.headers.get("Content-Disposition") || "";
    const filenameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);

    let filename = `cleaned_dataset_${datasetId}.csv`;

    if (filenameMatch) {
        filename = decodeURIComponent(filenameMatch[1] || filenameMatch[2]);
    }

    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
}

if (getElement("downloadCleanedButton")) {
    getElement("downloadCleanedButton").addEventListener("click", async () => {
        const button = getElement("downloadCleanedButton");

        if (!cleanedDatasetId) return;

        button.disabled = true;
        setCleaningMessage("Preparing your cleaned CSV...");

        try {
            await downloadCleanedDataset(cleanedDatasetId);
            setCleaningMessage("Your cleaned CSV download has started.");
        } catch (error) {
            setCleaningMessage(error.message, true);
        } finally {
            button.disabled = false;
        }
    });
}


// =========================================
// INITIAL APPLICATION CHECK
// =========================================

async function initializeApplication() {

    if (!accessToken) {
        getElement("authView").hidden = false;
        getElement("appView").hidden = true;
        setAuthMode("login");
        return;
    }

    getElement("authView").hidden = true;
    getElement("appView").hidden = false;

    await showApplication();
}

initializeApplication();
