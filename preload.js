const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Book management functions
  openBookDialog: () => ipcRenderer.invoke('open-book-dialog'),
  copyBookToLibrary: (sourcePath) => ipcRenderer.invoke('copy-book-to-library', sourcePath),
  // Drag and drop import support (renderer will call this with file path)
  getBooks: () => ipcRenderer.invoke('get-books'),
  readBookContent: (bookPath) => ipcRenderer.invoke('read-book-content', bookPath),
  deleteBook: (bookId) => ipcRenderer.invoke('delete-book', bookId),

  // File operations for reading progress
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),

  // WebDAV operations
  testWebDAVConnection: (config) => ipcRenderer.invoke('test-webdav-connection', config),
  uploadAllToWebDAV: (config) => ipcRenderer.invoke('upload-all-to-webdav', config),
  downloadAllFromWebDAV: (config) => ipcRenderer.invoke('download-all-from-webdav', config),

  // Book progress cache operations
  saveBookProgress: (bookId, progressData) => ipcRenderer.invoke('save-book-progress', bookId, progressData),
  loadBookProgress: (bookId) => ipcRenderer.invoke('load-book-progress', bookId),
  uploadBookCache: (bookId) => ipcRenderer.invoke('upload-book-cache', bookId),
  downloadBookProgress: (bookId) => ipcRenderer.invoke('download-book-progress', bookId),
  syncBookProgress: (bookId) => ipcRenderer.invoke('sync-book-progress', bookId),

  // Local settings management
  getLocalSettings: () => ipcRenderer.invoke('get-local-settings'),
  saveLocalSettings: (settings) => ipcRenderer.invoke('save-local-settings', settings),
  selectWebDAVFolder: () => ipcRenderer.invoke('select-webdav-folder'),
  saveWebDAVConfig: (config) => ipcRenderer.invoke('save-webdav-config', config),

  // TXT import by content (for drag-and-drop without relying on original path)
  importTxtContent: (fileName, content) => ipcRenderer.invoke('import-txt-content', fileName, content)
});
