const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("relay", {
  call: (action, args = {}) => ipcRenderer.invoke("relay", action, args),
  listen: (fn) => {
    const listener = (_e, data) => fn(data);
    ipcRenderer.on("relay:update", listener);
    return () => ipcRenderer.removeListener("relay:update", listener);
  },
});
