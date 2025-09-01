const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Book management functions
  openBookDialog: () => ipcRenderer.invoke('open-book-dialog'),
  copyBookToLibrary: (sourcePath) => ipcRenderer.invoke('copy-book-to-library', sourcePath),
  getBooks: () => ipcRenderer.invoke('get-books'),
  readBookContent: (bookPath) => ipcRenderer.invoke('read-book-content', bookPath)
});