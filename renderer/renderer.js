const $ = require('jquery');
const { ipcRenderer } = require('electron');



async function callPlatformLogin() {
    console.log("Starting login attempt...");
    const result = await window.electron.platformLogin();
    console.log("Platform login result:", result);
    document.getElementById('status').innerText = result.message;

}



document.addEventListener("DOMContentLoaded", async () => {
    if (window.location.pathname.includes('welcome.html')) {
        $('#closeWelcome').on("click",() => {
            ipcRenderer.send('show-login');
        });
    }

    if (window.location.pathname.includes('login.html')) {
        console.log("Login page detected!");

        // Retrieve saved username and password from storage
        ipcRenderer.invoke('get-store-data', 'username').then((savedUsername) => {
            $('#username').val(savedUsername);
        });

        ipcRenderer.invoke('get-store-data', 'password').then((savedPassword) => {
            $('#password').val(savedPassword);
        });

        $('#doLogin').click((event) => {
            event.preventDefault(); 

            const username = $('#username').val();
            const password = $('#password').val();

            if (!username || !password) {
                $('#status').text("⚠ Please enter both username and password.");
                $('#status').css("color", "red");
                return; // Stop further execution
            }


            ipcRenderer.invoke('authenticate-user', username, password)
            .then((result) => {
                $('#status').text(result.message);
                $('#status').css("color", result.success ? "green" : "red");

                if (result.success) {
                    ipcRenderer.invoke('set-store-data', 'username', username);
                    ipcRenderer.invoke('set-store-data', 'password', password);
                    // Save username and password via IPC
                    console.log("Credentials saved as login ok");     
                    ipcRenderer.send('show-registerext'); // Switch to registerext.html     
                }
            })
            .catch(() => {
                $('#status').text("❌ Login failed: Unable to reach server.");
                $('#status').css("color", "red");
            });

        });

    }
    if (window.location.pathname.includes('registerext.html')) {
        getCustomers();
        $('#customers').on("change",getExtensions());
        const checkbox = document.getElementById("toggleNotifications");
        // Request stored value from main process
    
        const showNotifications = await ipcRenderer.invoke("get-store-data", "showNotifications");
        checkbox.checked = showNotifications; // Set checkbox state

        $('#saveSettings').on("click",(event) => {
            event.preventDefault(); 
            const selectedCustomer = $('#customers').val();
            const selectedExtension = $('#extensions').val();        

            if (!selectedCustomer || !selectedExtension || selectedExtension === "notset") {
                $('#status').text("Please select a valid customer and extension before proceeding.");
                $('#status').css("color", "red");
                return;
            }

            ipcRenderer.invoke('set-store-data', 'showNotifications', document.getElementById("toggleNotifications").checked);
            ipcRenderer.invoke('set-store-data', 'customer', selectedCustomer);
            ipcRenderer.invoke('set-store-data', 'extension', selectedExtension);
            console.log("Settings saved");
            ipcRenderer.send('show-home'); // Switch to registerext.html 
        });
        $('#resetApp').on("click",(event) => {
            event.preventDefault(); 
            ipcRenderer.invoke('reset-app');
        });
        setupAutoLaunchCheckbox();

    }

});

async function setupAutoLaunchCheckbox(){
    const checkbox = document.getElementById("toggleAutoLaunch");
    const statusElement = document.getElementById("status");

    try {
        // Get current auto-launch status from main process
        const isEnabled = await ipcRenderer.invoke("get-auto-launch-status");
        checkbox.checked = isEnabled;

        // Listen for checkbox changes
        checkbox.addEventListener("change", async function () {
            const enable = this.checked;
            await ipcRenderer.invoke("set-auto-launch", enable);

            // Update the status message
            statusElement.textContent = `Auto-launch is now ${enable ? "enabled" : "disabled"}`;
            statusElement.style.color = enable ? "green" : "red";
        });
    } catch (error) {
        console.error("Error getting auto-launch status:", error);
    }

}

// Lets get all customers the user can set
// limited to first 200 results
function getCustomers() {

    ipcRenderer.invoke('get-customers')
            .then((customers) => {
                const customerDropdown = $('#customers');

                // Remove existing options
                customerDropdown.empty();

                // Add default option
                //customerDropdown.append($("<option></option>").attr("value", "me").text("Default Customer"));

                // Populate dropdown with received customers
                customers.forEach(customer => {
                    customerDropdown.append($("<option></option>").attr("value", customer.value).text(customer.label));
                });
            })
            .catch(error => {
                console.error("Failed to load customers:", error);
            });

    return false;
  }

  function getExtensions() {
    const customerId = $('#customers').val();

    ipcRenderer.invoke('get-extensions', customerId)
        .then((extensions) => {
            const extensionDropdown = $('#extensions');

            // Remove existing options
            extensionDropdown.empty();

            // Populate dropdown with received extensions
            console.log(extensions);
            extensions.forEach(extension => {
                if (!extension.readonly) extensionDropdown.append($("<option></option>").attr("value", extension.value).text(extension.label));
            });
        })
        .catch(error => {
            console.error("Failed to load extensions:", error);
        });
  }


