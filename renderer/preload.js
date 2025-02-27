const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    platformLogin: async function () {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        return await ipcRenderer.invoke('platform-login', { username, password });
    }
});