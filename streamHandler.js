const https = require('https');
const { Notification } = require('electron');
const path = require('path');

// Keep track of the active stream request
let activeRequest = null;
let reconnectTimeout = null;
let isStreamingStopped = false;

async function startStreaming(mainWindow) {
    const { default: Store } = await import('electron-store');
    const store = new Store();

    const username = store.get("username");
    const password = store.get("password");

    if (!username || !password) {
        console.error("Username or password is missing from store!");
        return;
    }

    // Reset the stopped flag when starting
    isStreamingStopped = false;
    console.log("Streaming started");

    const options = {
        hostname: 'pbx.sipcentric.com',
        path: '/api/v1/stream',
        method: 'GET',
        headers: {
            'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
            'Accept': 'application/json',
        },
    };

    function connectStream() {
        // Don't reconnect if we've explicitly stopped streaming
        if (isStreamingStopped) {
            return;
        }

        activeRequest = https.request(options, (res) => {
            res.on('data', (chunk) => {
                try {
                    const message = chunk.toString().trim();
                    // Ignore Atmosphere HTML comments and empty responses
                    if (message.startsWith('<!--') || message === '' || message === 'EOD') {
                        return;
                    }
                    const event = JSON.parse(message);
                    handleEvent(event, mainWindow, store);
                } catch (error) {
                    console.error('Error parsing stream data:', error);
                    console.log('Stream content: ', chunk.toString());
                }
            });

            res.on('end', () => {
                console.log('Stream ended. Reconnecting...');
                // Only reconnect if we haven't stopped the stream
                if (!isStreamingStopped) {
                    reconnectTimeout = setTimeout(connectStream, 5000); // Auto-reconnect after 5 seconds
                }
            });
        });

        activeRequest.on('error', (err) => {
            console.error('Stream error:', err);
            // Only reconnect if we haven't stopped the stream
            if (!isStreamingStopped) {
                reconnectTimeout = setTimeout(connectStream, 5000); // Retry on error
            }
        });

        activeRequest.end();
    }

    connectStream();
}

function stopStreaming() {
    if (isStreamingStopped)
    {   console.log("Streaming was already stopped");
        return true;
    }
    // Set flag to prevent reconnection
    isStreamingStopped = true;
    
    // Clear any pending reconnect timeout
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }
    
    // Abort the active request if it exists
    if (activeRequest) {
        activeRequest.destroy();
        activeRequest = null;
        console.log('Stream connection closed');
    }
    
    return true; // Indicate successful disconnect
}

function handleEvent(event, mainWindow, store) {
    if (event.event === 'heartbeat') {
        return; // Ignore heartbeat events
    }

    switch (event.event) {
        case 'incomingcall':
            const extension = store.get('extension', '');
            const customer = store.get('customer', '');
            const endpoint = `/customers/${customer}/endpoints/${extension}`;
            const showNotifications = store.get('showNotifications', false);
        

            if (event.values.endpoint == endpoint) {
                console.log('Incoming call to my extension:', event.values);
                if (showNotifications) showIncomingCallNotification(event.values);
            } else {
                console.log('Incoming call to other extension:', event.values);
            }
            break;
        case 'smsreceived':
            console.log('Incoming SMS:', event.values);
            break;
        case 'smsdelivered':
            console.log('SMS delivered:', event.values);
            break;
        case 'callended':
            console.log('Call Ended:', event.values);
            break;
        default:
            console.log('Unknown event:', event);
    }

    // Send event data to renderer process
    if (mainWindow) {
        mainWindow.webContents.send('stream-event', event);
    }
}


function showIncomingCallNotification(callerInfo) {
    const callerName = callerInfo.callerIdName || 'Unknown';
    const callerNumber = callerInfo.callerIdNumber || 'Unknown Number';
    const callerDid = callerInfo.did || 'Unpsecified';
    
    const notification = new Notification({
        title: 'Incoming Call',
        body: `${callerName} (${callerNumber})\nOn Number: ${callerDid}`,
        silent: true, // Set to true if you don't want a sound
        urgency: 'critical', // Makes notification more prominent
        timeoutType: 'default',
        icon: path.join(__dirname, 'assets/icon128.png')
    });
    
    notification.show();
    
    // Optional: You can handle click events on the notification
    notification.on('click', () => {
        // Focus the main window or open a specific call handling UI
        // For example:
        // mainWindow.focus();
        // mainWindow.webContents.send('show-call-ui', callerInfo);
    });
    
    return notification;
}

module.exports = { startStreaming, stopStreaming };