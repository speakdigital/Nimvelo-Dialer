const { app, BrowserWindow, ipcMain,Tray, Menu, globalShortcut, dialog  } = require('electron');
const { autoUpdater } = require("electron-updater");
const { startStreaming, stopStreaming } = require('./streamHandler'); // Import the streaming module
//const axios = require('axios'); // Import axios for API requests
const path = require("path");
//const fs = require("fs");
const { exec } = require("child_process");

const baseURL = "https://pbx.sipcentric.com/api/v1/"
const debug = !app.isPackaged;

let store;
let Store;
let win;
let tray;

console.log("Process started with arguments:", process.argv);

const gotTheLock = app.requestSingleInstanceLock();
const server = "https://github.com/speakdigital/Nimvelo-Dialer/releases/latest";

if (!gotTheLock) { 
    /* let logFilePath = path.join(app.getPath("userData"), "log.txt");
    let message = "Second instans started with arguments: "+process.argv.toString();
    fs.appendFileSync(logFilePath, `[${new Date().toISOString()}] ${message}\n`, "utf8"); */

    console.log("Process quitting as no second instance allowed");
    const telUrl = process.argv.find(arg => arg.startsWith("tel:"));
    if (telUrl) {
        // Send the tel URL to the existing instance
        console.log("Sending the tel: ardgument to the main instance");
        app.emit("second-instance", null, process.argv);
    }
    app.quit(); 
} else 
{   app.whenReady().then(async() => {
        autoUpdater.autoDownload = true; // Automatically download updates
    
        autoUpdater.on("update-downloaded", () => {
            dialog
                .showMessageBox({
                    type: "question",
                    buttons: ["Restart", "Later"],
                    defaultId: 0,
                    title: "Update Ready",
                    message: "Update downloaded. Restart the app to install?",
                })
                .then((result) => {
                    if (result.response === 0) {
                        autoUpdater.quitAndInstall();
                    }
                });
        });
    
        autoUpdater.on("error", (err) => {
            console.error("Update error:", err);
        });
    
        console.log("Checking for updates. My version is", app.getVersion());
        autoUpdater.checkForUpdatesAndNotify(); 

        console.log("Initializing Electron Store...");

        Store = (await import('electron-store')).default;
        store = new Store(); // Initialize after import
    
        console.log("Electron Store Ready!");
    
        const contextMenu = await import('electron-context-menu');
        contextMenu.default({
            showCopyImage: false,
            showSaveImageAs: false,
            showInspectElement: false
        });
 
           
        // Check if all required credentials are stored
        const username = store.get("username");
        const password = store.get("password");
        const customer = store.get("customer");
        const extension = store.get("extension");
    
        // Determine which page to load
        let startPage = 'welcome.html';
        if (username && password && customer && extension)
        {   const authResult = await authenticateUser(username, password);
            if (authResult.success === true) {
                startPage = 'home.html';
                startStreaming();
            }
        } 
    
        win = new BrowserWindow({
            width: 400,
            height: 600,
            resizable: false,
            webPreferences: {      nodeIntegration: true, contextIsolation: false  },
            icon: process.platform === 'win32'
      ? path.join(__dirname, 'assets', 'icon128x128.png') // Windows icon
      : path.join(__dirname, 'assets', 'icon.icns') 

        });

	if (process.platform === 'darwin') {
		app.dock.setIcon(path.join(__dirname, 'assets', 'icon1024x1024.png'));
	}    
        win.setMenu(null);
    
        win.loadFile(path.join(__dirname, `./renderer/${startPage}`));
        
        if (debug) {
            win.webContents.once('did-finish-load', () => {
               win.webContents.openDevTools();
            });    
        }
    
        globalShortcut.register("CommandOrControl+Shift+D", () => {
            if (win.isMinimized()) {
                win.restore();
            }
            win.show();
            win.focus();
            win.webContents.send("focus-dialer");
        });
    
        createTray();
        if (!debug) {
            if (process.platform === "win32") {
                registerProtocol();
            }
        }

    });
    
}


ipcMain.handle("set-auto-launch", async (event, enable) => {
    app.setLoginItemSettings({
        openAtLogin: enable,
        path: app.getPath("exe")
    });
    return enable;
});

ipcMain.handle("get-auto-launch-status", async () => {
    const settings = app.getLoginItemSettings();
    return settings.openAtLogin;
});


function registerProtocol() {
    const appPath = app.getPath("exe");
  
    const regCommands = [
      `reg add "HKCU\\Software\\Classes\\callto" /ve /d "URL:callto" /f`,
      `reg add "HKCU\\Software\\Classes\\callto" /v "URL Protocol" /d "" /f`,
      `reg add "HKCU\\Software\\Classes\\tel" /ve /d "URL:tel" /f`,
      `reg add "HKCU\\Software\\Classes\\tel" /v "URL Protocol" /d "" /f`,
      `reg add "HKCU\\Software\\Classes\\NimveloDialer.callto" /f`,
      `reg add "HKCU\\Software\\Classes\\NimveloDialer.callto\\Shell" /f`,
      `reg add "HKCU\\Software\\Classes\\NimveloDialer.callto\\Shell\\Open" /f`,
      `reg add "HKCU\\Software\\Classes\\NimveloDialer.callto\\Shell\\Open\\Command" /ve /d "\\"${appPath}\\" \\"%1\\"" /f`,
      `reg add "HKCU\\Software\\NimveloDialer" /f`,
      `reg add "HKCU\\Software\\NimveloDialer\\Capabilities" /f`,
      `reg add "HKCU\\Software\\NimveloDialer\\Capabilities" /v "ApplicationDescription" /d "NimveloDialer" /f`,
      `reg add "HKCU\\Software\\NimveloDialer\\Capabilities" /v "ApplicationName" /d "NimveloDialer" /f`,
      `reg add "HKCU\\Software\\NimveloDialer\\Capabilities\\URLAssociations" /f`,
      `reg add "HKCU\\Software\\NimveloDialer\\Capabilities\\URLAssociations" /v "callto" /d "NimveloDialer.callto" /f`,
      `reg add "HKCU\\Software\\NimveloDialer\\Capabilities\\URLAssociations" /v "tel" /d "NimveloDialer.callto" /f`,
      `reg add "HKCU\\Software\\RegisteredApplications" /v "NimveloDialer" /d "Software\\NimveloDialer\\Capabilities" /f`
    ];
  
    function runCommand(index) {
      if (index >= regCommands.length) {
        console.log("Protocol registration completed successfully.");
        return;
      }
  
      exec(regCommands[index], (error, stdout, stderr) => {
        if (error) {
          console.error(`Error executing command: ${regCommands[index]}`, error);
        }
        runCommand(index + 1);
      });
    }
  
    runCommand(0);
  }
  

// this is for Mac Only
app.on("open-url", (event, url) => {
    event.preventDefault();
    console.log("Open URL Called");
    handleTelLink(url);
  });
  
 // Handle "tel:" links (Windows/Linux when app is already running)
 app.on("second-instance", (event, argv) => {
    console.log("Second instance called");
    const telUrl = argv.find(arg => arg.startsWith("tel:"));
    if (telUrl) handleTelLink(telUrl);
  });
  
  function handleTelLink(url) {
    console.log("Dialing from URL: ", url);
    const phoneNumber = url.replace("tel:", "").replace("%20", "").trim();
    // Integrate with your VoIP provider API or your dialer UI
    if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
        win.webContents.send("dial-phone", phoneNumber);
    }

  }

function createTray() {
    const iconPath = path.join(__dirname, 'assets/icon24x24.png'); // Ensure the path is correct
    tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show App', click: () => win.show() },
        { label: 'Quit', click: () =>  {
            app.isQuiting = true;
            tray.destroy();
            app.exit(); // ✅ Force exit the app immediately
        }}
    ]);

    tray.setToolTip('Nimvelo Dialer');
    tray.setContextMenu(contextMenu);

    // Hide window instead of quitting when closing
    win.on('close', (event) => {
        event.preventDefault();
        win.hide();
    });

    tray.on('click', () => {
        win.show();
    });
}


app.on('window-all-closed', (event) => {
    if (!app.isQuiting) {
        event.preventDefault(); // Prevents quitting when windows are closed
    } else {
        app.quit(); // Allow quitting
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});


ipcMain.handle("show-confirm-dialog", async (event, options) => {
    const result = await dialog.showMessageBox({
        type: "warning",
        buttons: ["Cancel", options.button],
        defaultId: 1,
        title: options.title || "Confirm",
        message: options.message || "Are you sure?",
    });

    return result.response === 1; // Returns true if "Delete" is clicked
});

ipcMain.on('show-login', () => {
    win.loadFile(path.join(__dirname, './renderer/login.html')); // Switch to the login page
});
ipcMain.on('show-registerext', () => {
    win.loadFile(path.join(__dirname, './renderer/registerext.html')); // Switch to extension setup page
    stopStreaming(win);
});
ipcMain.on('show-home', () => {
    win.loadFile(path.join(__dirname, './renderer/home.html')); // Switch to extension setup page
    startStreaming(win);
});

ipcMain.handle("get-app-version", () => {
    return app.getVersion();
  });

ipcMain.handle('get-store-data', (event, key) => {
    return store.get(key, '');
});

ipcMain.handle('set-store-data', (event, key, value) => {
    store.set(key, value);
});

ipcMain.on("close-app", () => {
    console.log("Closing application");
    app.isQuiting = true;
    app.exit();
});

ipcMain.handle("reset-app", () => {
    // Clear all data
    store.clear();
    console.log("Electron Store has been cleared!");
    win.loadFile(path.join(__dirname, `./renderer/welcome.html`));
    
});

async function authenticateUser(username, password) {
    const baseURL = "https://pbx.sipcentric.com/api/v1/";
    const thispath = new URL('customers/me', baseURL).toString();

    try {
        const response = await fetch(thispath, {
            method: 'HEAD',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(username + ':' + password).toString('base64')
            }
        });

        if (response.ok) {
            store.set('username', username);
            store.set('password', password);
            return { success: true, message: "Login successful!" };
        } else {
            return { success: false, message: "Invalid credentials" };
        }
    } catch (error) {
        return { success: false, message: "Network error. Please try again." };
    }
}

// Make authenticateUser accessible via IPC
ipcMain.handle('authenticate-user', async (event, username, password) => {
    return await authenticateUser(username, password);
});

// Handle getting customers from API with Basic Auth
ipcMain.handle('get-customers', async () => {
    const baseURL = "https://pbx.sipcentric.com/api/v1/";
    const requestURL = new URL('customers', baseURL).toString();
    
    // Retrieve stored credentials
    const username = store.get('username', '');
    const password = store.get('password', '');

    console.log("About to fecth customers from ",requestURL);

    try {
        const response = await fetch(requestURL, {
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(username + ':' + password).toString('base64')
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        const localCustomers = [];

        data.items.forEach(item => {
            let label = item.company;
            if (item.partnerCompany) {
                label += ' - ' + item.partnerCompany;
            }
            localCustomers.push({ label: label, value: item.id });
        });

        return localCustomers; // Send back to renderer
    } catch (error) {
        console.error("Error fetching customers:", error);
        return [];
    }
});


ipcMain.handle('get-extensions', async (event, customerId) => {
    if (!customerId) {
        console.error("No customer ID provided. Tying from settings.");
        customerId = store.get('customer', '');
        if (!customerId) return [];
    }

    const baseURL = "https://pbx.sipcentric.com/api/v1/";
    const requestURL = new URL(`customers/${customerId}/endpoints`, baseURL).toString();
    console.log("about to get extension list from ",requestURL);

    // Retrieve stored credentials
    const username = store.get('username', '');
    const password = store.get('password', '');

    console.log("About to get extensions from ",requestURL);
    
    try {
        const response = await fetch(requestURL, {
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(username + ':' + password).toString('base64')
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        const localExtensions = [];
        
        console.log("Received extension list: ",data);

        data.items.forEach(item => {
            if (item.type == "phone") {
                let label = `${item.name} - ${item.shortNumber}`;
                localExtensions.push({
                    label: label,
                    value: item.id,
                    name: item.name, shortNumber: item.shortNumber,
                    readonly: item.hasOwnProperty('readOnly') ? Boolean(item.readOnly) : false,
                    defaultCallerId: item.defaultCallerId
                });
            }
        });

        return localExtensions; // Send back to renderer
    } catch (error) {
        console.error("Error fetching extensions:", error);
        return [];
    }
});


ipcMain.handle('get-phonebook', async (event) => {



    const customer = store.get('customer', '');

    // Retrieve stored credentials
    const username = store.get('username', '');
    const password = store.get('password', '');

    const baseURL = "https://pbx.sipcentric.com/api/v1/";
    const requestURL = new URL(`customers/${customer}/phonebook?pageSize=200`, baseURL).toString();

    console.log("about to get phonebook from ",requestURL);

    let nextpage = requestURL;
    const localPhonebook = [];

    try {
        do {
            const response = await fetch(nextpage, {
                method: 'GET',
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(username + ':' + password).toString('base64')
                }
            });

            const data = await response.json();
            nextpage = "";

            if (!response.ok) {
                throw new Error(`API Error: ${response.statusText}`);
            }

            data.items.forEach(item => {
                if (item.type == "phonebookentry") {
                    localPhonebook.push({
                        id: item.id,
                        name: item.name,
                        phoneNumber: item.phoneNumber
                    });
                }
            });
            nextpage = data.nextPage || "";

        } while (nextpage !== "")

        return localPhonebook; // Send back to renderer
    } catch (error) {
        console.error("Error fetching extensions:", error);
        return [];
    }
});


ipcMain.handle('get-me', async (event) => {

    const customer = store.get('customer', '');
    const extension = store.get('extension', '');

    const baseURL = "https://pbx.sipcentric.com/api/v1/";
    const requestURL = new URL(`customers/${customer}/endpoints/${extension}`, baseURL).toString();

    console.log("about to get my extension from ",requestURL);

    // Retrieve stored credentials
    const username = store.get('username', '');
    const password = store.get('password', '');

    try {
        const response = await fetch(requestURL, {
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(username + ':' + password).toString('base64')
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        return data; // Send back to renderer
    } catch (error) {
        console.error("Error fetching my extension:", error);
        return [];
    }
});

ipcMain.handle('get-outgoingnumers', async (event) => {
    const customer = store.get('customer', '');
    
    const baseURL = "https://pbx.sipcentric.com/api/v1/";
    const requestURL = new URL(`customers/${customer}/outgoingcallerids?pageSize=200`, baseURL).toString();

    // Retrieve stored credentials
    const username = store.get('username', '');
    const password = store.get('password', '');

    console.log("about to get outgoing numbers from ",requestURL);

    try {
        const response = await fetch(requestURL, {
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(username + ':' + password).toString('base64')
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        const outgoingNumbers = [];
   
        data.items.forEach(item => {
            if (item.type == "outgoingcallerid" && item.allowCalls == true && item.status == "APPROVED") {
                let label = `${item.number}`;
                outgoingNumbers.push({
                    label: label,
                    value: item.id
                });
            }
        });

        return outgoingNumbers; // Send back to renderer
    

    } catch (error) {
        console.error("Error fetching my extension:", error);
        return [];
    }

});


ipcMain.handle('dial', async (event, call, selectedCallerId, withhold) => {
    console.log(`Dialing ${call} using Caller ID ${selectedCallerId}, Withhold: ${withhold}`);

    if (withhold == 1) { call = '*67' + call;  }
    call = call.replace(/(?:\+44|\(|\)|-|\s)/g, "");

    try {
        const baseURL = "https://pbx.sipcentric.com/api/v1/";

        const username = store.get('username', '');
        const password = store.get('password', '');
        const customer = store.get('customer', '');
        const extension = store.get('extension', '');


        const requestURL = new URL(`customers/${customer}/calls`, baseURL).toString();
        const endpoint = new URL(`customers/${customer}/endpoints/${extension}`, baseURL).toString();
        const outgoingId = new URL(`customers/${customer}/outgoingcallerids/${selectedCallerId}`, baseURL).toString();


        var requestBody = {
            type: "call",
            endpoint: endpoint,
            to: call,
            callerId: outgoingId
          }

        console.log("About to make a call using ",requestURL, " with data ",requestBody)

        const response = await fetch(requestURL, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(username + ':' + password).toString('base64'),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        return { success: true, message: "Call initiated successfully!" };
    } catch (error) {
        console.error("Error dialing:", error);
        return { success: false, message: error.message };
    }
});

ipcMain.handle('delete-contact', async (event, contactid) => {
    console.log(`Deleting ${contactid} from address book.`);


    try {
        const baseURL = "https://pbx.sipcentric.com/api/v1/";

        const username = store.get('username', '');
        const password = store.get('password', '');
        const customer = store.get('customer', '');


        const requestURL = new URL(`customers/${customer}/phonebook/${contactid}`, baseURL).toString();


        const response = await fetch(requestURL, {
            method: 'DELETE',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(username + ':' + password).toString('base64')
            }
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        return { success: true, message: "Phonebook Entry deleted" };
    } catch (error) {
        console.error("Error deleting:", error);
        return { success: false, message: error.message };
    }
});


ipcMain.handle('phonebook-add', async (event, name, number) => {
    console.log(`Adding ${name} with number ${number} to address book.`);


    try {
        const baseURL = "https://pbx.sipcentric.com/api/v1/";

        const username = store.get('username', '');
        const password = store.get('password', '');
        const customer = store.get('customer', '');


        const requestURL = new URL(`customers/${customer}/phonebook`, baseURL).toString();

        var requestBody = {
            type: "phonebookentry",
            name: name,
            phoneNumber: number
          }

        const response = await fetch(requestURL, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(username + ':' + password).toString('base64') ,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        return { success: true, message: "Phonebook Entry added" };
    } catch (error) {
        console.error("Error deleting:", error);
        return { success: false, message: error.message };
    }
});

