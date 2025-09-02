const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const iconv = require('iconv-lite');
const jschardet = require('jschardet');
// Import epub2 library correctly
const Epub = require('epub2').default;
// Import WebDAV client
const { createClient } = require('webdav');
console.log('EPUB2 library imported successfully');
const isDev = process.env.NODE_ENV === 'development';

// Helper function to get cache file path for a book
function getBookCachePath(bookId) {
  const localSettings = loadLocalSettings();
  if (!localSettings.webdavFolderPath) {
    // Fallback to default path if WebDAV folder not set
    const cacheDir = path.join(__dirname, 'book', 'cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    return path.join(cacheDir, `${bookId}.json`);
  }

  const cacheDir = path.join(localSettings.webdavFolderPath, 'cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return path.join(cacheDir, `${bookId}.json`);
}

// Helper function to get book data file path
function getBookDataPath() {
  const localSettings = loadLocalSettings();
  if (!localSettings.webdavFolderPath) {
    // Fallback to default path if WebDAV folder not set
    return path.join(__dirname, 'book', 'book.json');
  }

  return path.join(localSettings.webdavFolderPath, 'book.json');
}

// Helper function to get settings file path
function getSettingsPath() {
  const localSettings = loadLocalSettings();
  if (!localSettings.webdavFolderPath) {
    // Fallback to default path if WebDAV folder not set
    return path.join(__dirname, 'book', 'settings.json');
  }

  return path.join(localSettings.webdavFolderPath, 'settings.json');
}

// Helper function to get WebDAV config from local settings
function getWebDAVConfig() {
  const localSettings = loadLocalSettings();
  return localSettings.webdavConfig || {
    enabled: false,
    webdavPath: '',
    username: '',
    password: ''
  };
}

// Helper function to get local settings file path
function getLocalSettingsPath() {
  return path.join(__dirname, 'local-settings.json');
}

// Helper function to load local settings
function loadLocalSettings() {
  try {
    const settingsPath = getLocalSettingsPath();
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load local settings:', error);
  }
  return {
    webdavFolderPath: null,
    isFirstRun: true,
    webdavConfig: {
      enabled: false,
      webdavPath: '',
      username: '',
      password: ''
    },
    lastUpdated: new Date().toISOString()
  };
}

// Helper function to save local settings
function saveLocalSettings(settings) {
  try {
    const settingsPath = getLocalSettingsPath();
    settings.lastUpdated = new Date().toISOString();
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log('Local settings saved:', settings);
  } catch (error) {
    console.error('Failed to save local settings:', error);
  }
}

// Helper function to clean book.json by removing readingProgress fields
function cleanBookJson() {
  try {
    const bookJsonPath = getBookDataPath();
    if (fs.existsSync(bookJsonPath)) {
      const bookData = JSON.parse(fs.readFileSync(bookJsonPath, 'utf8'));
      let needsUpdate = false;

      if (bookData.books && Array.isArray(bookData.books)) {
        bookData.books = bookData.books.map(book => {
          if (book.readingProgress || book.bookmarks) {
            needsUpdate = true;
            // Remove readingProgress and bookmarks from book.json
            const { readingProgress, bookmarks, ...cleanBook } = book;
            return cleanBook;
          }
          return book;
        });
      }

      if (needsUpdate) {
        bookData.lastUpdated = new Date().toISOString();
        fs.writeFileSync(bookJsonPath, JSON.stringify(bookData, null, 2));
        console.log('Cleaned book.json: removed readingProgress and bookmarks fields');
      }
    }
  } catch (error) {
    console.error('Failed to clean book.json:', error);
  }
}

// Helper function to migrate absolute paths to relative paths
function migrateBookPaths() {
  try {
    const bookJsonPath = getBookDataPath();
    if (!fs.existsSync(bookJsonPath)) {
      return;
    }

    const bookData = JSON.parse(fs.readFileSync(bookJsonPath, 'utf8'));
    let needsUpdate = false;

    if (bookData.books && Array.isArray(bookData.books)) {
      const localSettings = loadLocalSettings();
      const currentBookDir = localSettings.webdavFolderPath || path.join(__dirname, 'book');

      bookData.books = bookData.books.map(book => {
        // Check if filePath is an absolute path that needs migration
        if (book.filePath && path.isAbsolute(book.filePath)) {
          // Try to convert absolute path to relative path
          try {
            const relativePath = path.relative(currentBookDir, book.filePath);
            // Only update if the relative path doesn't go outside the book directory
            if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
              console.log(`Migrating book path: ${book.filePath} -> ${relativePath}`);
              needsUpdate = true;
              return {
                ...book,
                filePath: relativePath
              };
            }
          } catch (error) {
            console.log(`Could not migrate path for book: ${book.title}, keeping original path`);
          }
        }
        return book;
      });
    }

    if (needsUpdate) {
      bookData.lastUpdated = new Date().toISOString();
      fs.writeFileSync(bookJsonPath, JSON.stringify(bookData, null, 2));
      console.log('Migrated book paths from absolute to relative');
    }
  } catch (error) {
    console.error('Failed to migrate book paths:', error);
  }
}

// Helper function to save book progress to cache file
async function saveBookProgressToCache(bookId, progressData) {
  try {
    const cachePath = getBookCachePath(bookId);
    fs.writeFileSync(cachePath, JSON.stringify(progressData, null, 2));
    console.log(`Book progress saved to cache: ${bookId}`);

    // Auto upload to WebDAV
    await autoUploadBookCacheToWebDAV(bookId);
  } catch (error) {
    console.error(`Failed to save book progress to cache: ${bookId}`, error);
  }
}

// Helper function to load book progress from cache file
async function loadBookProgressFromCache(bookId) {
  try {
    // First try to download from WebDAV to get the latest progress
    const webdavProgress = await autoDownloadBookProgressFromWebDAV(bookId);
    if (webdavProgress) {
      console.log(`Loaded progress from WebDAV for book: ${bookId}`);
      return webdavProgress;
    }

    // Fallback to local cache if WebDAV is not available
    const cachePath = getBookCachePath(bookId);
    if (fs.existsSync(cachePath)) {
      const data = fs.readFileSync(cachePath, 'utf8');
      console.log(`Loaded progress from local cache for book: ${bookId}`);
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`Failed to load book progress from cache: ${bookId}`, error);
  }
  return null;
}

// Helper function to auto upload book cache to WebDAV
async function autoUploadBookCacheToWebDAV(bookId) {
  try {
    const webdavConfig = getWebDAVConfig();

    if (!webdavConfig.enabled) {
      console.log('WebDAV sync disabled, skipping auto upload');
      return;
    }

    if (!webdavConfig.webdavPath || !webdavConfig.username || !webdavConfig.password) {
      console.log('WebDAV config incomplete, skipping auto upload');
      return;
    }

    // Create WebDAV client using the configured path
    const client = createClient(webdavConfig.webdavPath, {
      username: webdavConfig.username,
      password: webdavConfig.password
    });

    // Upload the cache file to WebDAV root
    const localPath = getBookCachePath(bookId);
    const remotePath = `/progress_${bookId}.json`; // Upload to root of WebDAV path with progress prefix

    if (fs.existsSync(localPath)) {
      const fileBuffer = fs.readFileSync(localPath);
      await client.putFileContents(remotePath, fileBuffer);
      console.log(`Auto uploaded book progress: ${bookId}.json`);
    }
  } catch (error) {
    console.error(`Auto upload book progress ${bookId} to WebDAV failed:`, error);
  }
}

// Helper function to auto download book progress from WebDAV
async function autoDownloadBookProgressFromWebDAV(bookId) {
  try {
    const webdavConfig = getWebDAVConfig();

    if (!webdavConfig.enabled) {
      console.log('WebDAV sync disabled, skipping auto download');
      return null;
    }

    if (!webdavConfig.webdavPath || !webdavConfig.username || !webdavConfig.password) {
      console.log('WebDAV config incomplete, skipping auto download');
      return null;
    }

    // Create WebDAV client using the configured path
    const client = createClient(webdavConfig.webdavPath, {
      username: webdavConfig.username,
      password: webdavConfig.password
    });

    // Download the progress file from WebDAV root
    const remotePath = `/progress_${bookId}.json`;
    const localPath = getBookCachePath(bookId);

    try {
      const fileBuffer = await client.getFileContents(remotePath);
      fs.writeFileSync(localPath, fileBuffer);
      console.log(`Auto downloaded book progress: ${bookId}.json`);
      return JSON.parse(fileBuffer.toString());
    } catch (error) {
      console.log(`No remote progress file found for book ${bookId}`);
      return null;
    }
  } catch (error) {
    console.error(`Auto download book progress ${bookId} from WebDAV failed:`, error);
    return null;
  }
}



function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:7999');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers for book management
ipcMain.handle('open-book-dialog', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'eBooks', extensions: ['epub', 'pdf', 'txt', 'mobi'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// IPC handler for selecting WebDAV folder
ipcMain.handle('select-webdav-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: '选择WebDAV同步文件夹',
    message: '请选择用于WebDAV同步的文件夹'
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('copy-book-to-library', async (event, sourcePath) => {
  try {
    console.log('Copying book from:', sourcePath);

    const localSettings = loadLocalSettings();
    const bookDir = localSettings.webdavFolderPath || path.join(__dirname, 'book');
    if (!fs.existsSync(bookDir)) {
      fs.mkdirSync(bookDir, { recursive: true });
    }

    const fileName = path.basename(sourcePath);
    const targetPath = path.join(bookDir, fileName);

    console.log('Target path:', targetPath);

    // Copy file
    fs.copyFileSync(sourcePath, targetPath);

        // Generate a unique ID based on filename hash for consistency
    // This ensures the same file always gets the same ID
    const fileNameHash = fileName.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '').substring(0, 20);
    const uniqueId = fileNameHash;

    console.log('Generated fileNameHash:', fileNameHash);
    console.log('Generated uniqueId:', uniqueId);

    // Return book info
    const stats = fs.statSync(targetPath);
    let bookTitle = path.parse(fileName).name;
    let bookAuthor = undefined;

    // Try to extract metadata from EPUB files
                if (path.extname(fileName).toLowerCase() === '.epub') {
        try {


          console.log('Extracting EPUB metadata...');
          const epub = new Epub(targetPath);

          // Wait for EPUB to be ready
          await new Promise((resolve, reject) => {
            epub.on('end', resolve);
            epub.on('error', reject);
          });

          // Extract title and author from metadata
          if (epub.metadata) {
            if (epub.metadata.title) {
              bookTitle = epub.metadata.title;
              console.log('Extracted title:', bookTitle);
            }
            if (epub.metadata.creator) {
              bookAuthor = epub.metadata.creator;
              console.log('Extracted author:', bookAuthor);
            }
          }

          // Close the EPUB to free resources
          if (epub.close) {
            epub.close();
          }
        } catch (epubError) {
          console.warn('Failed to extract EPUB metadata:', epubError);
          // Fallback to filename
        }
      }

    const bookInfo = {
      id: uniqueId,
      title: bookTitle,
      author: bookAuthor,
      fileName: fileName,
      filePath: fileName, // Store only the filename as relative path
      size: stats.size,
      addedAt: new Date().toISOString()
    };

        // Update book.json with the new book
    const bookJsonPath = getBookDataPath();
    let bookData = { books: [], lastUpdated: new Date().toISOString() };

    try {
      if (fs.existsSync(bookJsonPath)) {
        const existingData = fs.readFileSync(bookJsonPath, 'utf8');
        bookData = JSON.parse(existingData);
      }
    } catch (error) {
      console.warn('Failed to read existing book.json, creating new one');
    }

    // Check if a book with the same filename already exists
    const existingBookByFileName = bookData.books.find(book => book.fileName === fileName);
    if (existingBookByFileName) {
      console.log('Book with same filename already exists:', existingBookByFileName.fileName);
      return {
        success: false,
        message: `书籍 "${fileName}" 已经导入过了`,
        existingBook: existingBookByFileName
      };
    }

    // Add new book to the list (without readingProgress - it's stored in cache files)
    const existingBookIndex = bookData.books.findIndex(book => book.id === uniqueId);
    if (existingBookIndex >= 0) {
      bookData.books[existingBookIndex] = bookInfo;
    } else {
      bookData.books.push(bookInfo);
    }

    bookData.lastUpdated = new Date().toISOString();

    // Save updated book.json
    fs.writeFileSync(bookJsonPath, JSON.stringify(bookData, null, 2));

    console.log('Book copied successfully and book.json updated:', bookInfo);
    return {
      success: true,
      message: `书籍 "${fileName}" 导入成功`,
      book: bookInfo
    };
  } catch (error) {
    console.error('Error copying book:', error);
    throw error;
  }
});

ipcMain.handle('get-books', async () => {
  try {
    const localSettings = loadLocalSettings();
    const bookDir = localSettings.webdavFolderPath || path.join(__dirname, 'book');

    if (!fs.existsSync(bookDir)) {
      console.log('Book directory does not exist');
      return [];
    }

    // Only clean and migrate on first load or when needed
    // These operations are expensive and don't need to run every time
    const bookJsonPath = getBookDataPath();
    const bookJsonStats = fs.existsSync(bookJsonPath) ? fs.statSync(bookJsonPath) : null;
    const lastCleanTime = bookJsonStats ? bookJsonStats.mtime.getTime() : 0;
    const now = Date.now();

    // Only clean and migrate if book.json is older than 1 hour or doesn't exist
    if (now - lastCleanTime > 3600000 || !bookJsonStats) {
      console.log('Performing maintenance operations on book.json');
      cleanBookJson();
      migrateBookPaths();
    }

    // Check if book.json exists
    if (!fs.existsSync(bookJsonPath)) {
      console.log('book.json does not exist, creating empty book.json');
      // Create empty book.json
      const emptyBookData = {
        books: [],
        lastUpdated: new Date().toISOString()
      };
            fs.writeFileSync(bookJsonPath, JSON.stringify(emptyBookData, null, 2));

      return [];
    }

    try {
      // Read books from book.json
      const bookData = fs.readFileSync(bookJsonPath, 'utf8');
      const parsedData = JSON.parse(bookData);

      if (parsedData.books && Array.isArray(parsedData.books)) {
                // Load progress from cache files for each book and update file paths
        // Use Promise.allSettled to avoid one failed book blocking others
        const booksWithProgress = await Promise.allSettled(parsedData.books.map(async (book) => {
          // Build absolute file path from relative path
          const currentBookDir = localSettings.webdavFolderPath || path.join(__dirname, 'book');
          // Use filePath if it's a relative path, otherwise fallback to fileName
          const relativePath = book.filePath || book.fileName;
          const updatedFilePath = path.join(currentBookDir, relativePath);

          // Check if file actually exists
          if (!fs.existsSync(updatedFilePath)) {
            console.log(`Book file not found: ${updatedFilePath}, skipping book: ${book.title}`);
            return null; // Return null for non-existent files
          }

          try {
            const cacheData = await loadBookProgressFromCache(book.id);
            if (cacheData) {
              return {
                ...book,
                filePath: updatedFilePath, // Return absolute path for reading
                readingProgress: {
                  progress: Math.round(cacheData.progress * 100) / 100, // 精确到小数点后2位
                  lastReadAt: cacheData.lastReadAt,
                  readingTime: cacheData.readingTime
                },
                bookmarks: cacheData.bookmarks || []
              };
            }
            // If no cache data, return book without readingProgress
            return {
              ...book,
              filePath: updatedFilePath, // Return absolute path for reading
              readingProgress: undefined,
              bookmarks: []
            };
          } catch (error) {
            console.error(`Error loading progress for book ${book.id}:`, error);
            // Return book without progress if cache loading fails
            return {
              ...book,
              filePath: updatedFilePath,
              readingProgress: undefined,
              bookmarks: []
            };
          }
        }));

        // Filter out null values and extract successful results
        const validBooks = booksWithProgress
          .filter(result => result.status === 'fulfilled' && result.value !== null)
          .map(result => result.value);

        console.log('Returning books with progress from cache:', validBooks);
        return validBooks;
      } else {
        console.log('Invalid book.json format, recreating empty book.json');
        // Recreate empty book.json
        const emptyBookData = {
          books: [],
          lastUpdated: new Date().toISOString()
        };
              fs.writeFileSync(bookJsonPath, JSON.stringify(emptyBookData, null, 2));

      return [];
      }
    } catch (error) {
      console.error('Error reading book.json:', error);
      console.log('Recreating empty book.json due to error');
      // Recreate empty book.json
      const emptyBookData = {
        books: [],
        lastUpdated: new Date().toISOString()
      };
            fs.writeFileSync(bookJsonPath, JSON.stringify(emptyBookData, null, 2));

      return [];
    }
  } catch (error) {
    console.error('Error getting books:', error);
    return [];
  }
});

// Helper function to scan files and create initial book data
// NOTE: This function is no longer used. We now create empty book.json and only add books when importing.
/*
async function scanAndCreateBookData(bookDir) {
  const files = fs.readdirSync(bookDir).filter(file => file !== 'book.json');
  console.log('Found files in book directory (excluding book.json):', files);

  const books = await Promise.all(files.map(async fileName => {
    const filePath = path.join(bookDir, fileName);
    const stats = fs.statSync(filePath);

    // Generate ID that matches the format used in copy-book-to-library
    const fileNameHash = fileName.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '').substring(0, 20);
    const uniqueId = fileNameHash;

    console.log('File:', fileName, 'fileNameHash:', fileNameHash, 'uniqueId:', uniqueId);

    // Try to extract metadata from EPUB files
    let bookTitle = path.parse(fileName).name;
    let bookAuthor = undefined;

    if (path.extname(fileName).toLowerCase() === '.epub') {
      try {
        console.log('Extracting EPUB metadata for existing file:', fileName);
        const epub = new Epub(filePath);

        // Wait for EPUB to be ready
        await new Promise((resolve, reject) => {
          epub.on('end', resolve);
          epub.on('error', reject);
        });

        // Extract title and author from metadata
        if (epub.metadata) {
          if (epub.metadata.title) {
            bookTitle = epub.metadata.title;
            console.log('Extracted title:', bookTitle);
          }
          if (epub.metadata.creator) {
            bookAuthor = epub.metadata.creator;
            console.log('Extracted author:', bookAuthor);
          }
        }

        // Close the EPUB to free resources
        if (epub.close) {
          epub.close();
        }
      } catch (epubError) {
        console.warn('Failed to extract EPUB metadata for existing file:', epubError);
        // Fallback to filename
      }
    }

    const bookInfo = {
      id: uniqueId,
      title: bookTitle,
      author: bookAuthor,
      fileName: fileName,
      filePath: filePath,
      size: stats.size,
      addedAt: stats.birthtime.toISOString()
    };

    console.log('Processed book:', bookInfo);
    return bookInfo;
  }));

  // Create and save book.json with scanned data
          const booksWithProgress = books.map(book => ({
          ...book,
          readingProgress: {
            progress: 0,
            lastReadAt: new Date().toISOString(),
            readingTime: 0
          },
          bookmarks: []
        }));

  const bookData = {
    books: booksWithProgress,
    lastUpdated: new Date().toISOString()
  };

  const bookJsonPath = path.join(bookDir, 'book.json');
  fs.writeFileSync(bookJsonPath, JSON.stringify(bookData, null, 2));

  // Auto upload book.json to WebDAV
  autoUploadJsonToWebDAV('book.json');

  console.log('Created book.json with scanned data');
  return books;
}
*/

ipcMain.handle('delete-book', async (event, bookId) => {
  try {
    console.log('Deleting book with ID:', bookId);

    const localSettings = loadLocalSettings();
    const bookDir = localSettings.webdavFolderPath || path.join(__dirname, 'book');
    if (!fs.existsSync(bookDir)) {
      throw new Error('书籍目录不存在');
    }

    // Get all books to find the one to delete
    const files = fs.readdirSync(bookDir);
    let bookToDelete = null;

    for (const fileName of files) {
      const filePath = path.join(bookDir, fileName);
      const stats = fs.statSync(filePath);
      const fileNameHash = fileName.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '').substring(0, 20);
      const uniqueId = fileNameHash;

      if (uniqueId === bookId) {
        bookToDelete = { fileName, filePath };
        break;
      }
    }

    if (!bookToDelete) {
      throw new Error(`找不到ID为 "${bookId}" 的书籍`);
    }

    // Delete the file
    fs.unlinkSync(bookToDelete.filePath);

    // Delete the cache file if it exists
    const cachePath = getBookCachePath(bookId);
    if (fs.existsSync(cachePath)) {
      try {
        fs.unlinkSync(cachePath);
        console.log(`Deleted cache file: ${cachePath}`);
      } catch (error) {
        console.warn('Failed to delete cache file:', error);
      }
    }

        // Update book.json to remove the deleted book
    const bookJsonPath = getBookDataPath();
    if (fs.existsSync(bookJsonPath)) {
      try {
        const bookData = JSON.parse(fs.readFileSync(bookJsonPath, 'utf8'));

        // Remove book from books array
        bookData.books = bookData.books.filter(book => book.id !== bookId);

        bookData.lastUpdated = new Date().toISOString();
        fs.writeFileSync(bookJsonPath, JSON.stringify(bookData, null, 2));

        console.log('Book deleted and book.json updated');
      } catch (error) {
        console.warn('Failed to update book.json after deletion:', error);
      }
    }

    console.log('Book file deleted:', bookToDelete.filePath);
    return { success: true, message: '书籍删除成功' };
  } catch (error) {
    console.error('Error deleting book:', error);
    throw error;
  }
});

ipcMain.handle('read-book-content', async (event, bookPath) => {
  try {
    if (!fs.existsSync(bookPath)) {
      throw new Error(`文件不存在: ${bookPath}`);
    }

    const ext = path.extname(bookPath).toLowerCase();

    if (ext === '.txt') {
      // Read file as buffer first to detect encoding
      const buffer = fs.readFileSync(bookPath);

      // Detect encoding
      const detected = jschardet.detect(buffer);
      console.log('Detected encoding:', detected);

      // Use detected encoding or fallback to utf8
      let encoding = 'utf8';
      if (detected && detected.encoding) {
        // Map some common encoding names
        const encodingMap = {
          'GB2312': 'gb2312',
          'GBK': 'gbk',
          'UTF-8': 'utf8',
          'UTF-16LE': 'utf16le',
          'UTF-16BE': 'utf16be',
          'windows-1252': 'windows1252'
        };
        encoding = encodingMap[detected.encoding] || detected.encoding.toLowerCase();
      }

      // Try to decode with detected encoding
      let content;
      try {
        if (encoding === 'utf8') {
          content = buffer.toString('utf8');
        } else {
          content = iconv.decode(buffer, encoding);
        }
      } catch (decodeError) {
        console.warn('Failed to decode with detected encoding, falling back to utf8:', decodeError);
        content = buffer.toString('utf8');
      }

      return { content, type: 'text', encoding: encoding };
    } else if (ext === '.epub') {
      try {
        console.log('Reading EPUB file:', bookPath);



        // Parse EPUB file
        let epub;
        try {
          epub = new Epub(bookPath);
          console.log('EPUB object created:', epub);
        } catch (epubCreateError) {
          console.error('Failed to create EPUB object:', epubCreateError);
          throw new Error(`无法创建EPUB对象: ${epubCreateError.message}`);
        }

        // Wait for EPUB to be ready with timeout
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('EPUB解析超时，请检查文件是否完整'));
          }, 30000); // 30 second timeout

          epub.on('end', () => {
            console.log('EPUB parsing completed');
            clearTimeout(timeout);
            resolve();
          });
          epub.on('error', (error) => {
            console.error('EPUB parsing error:', error);
            clearTimeout(timeout);
            reject(error);
          });
        });

        // Get book metadata
        const metadata = epub.metadata;
        console.log('EPUB metadata:', metadata);

        // Get table of contents
        const toc = epub.toc;
        console.log('EPUB TOC:', toc);

        // Log all available properties
        console.log('EPUB object properties:', Object.keys(epub));
        console.log('EPUB spine:', epub.spine);
        console.log('EPUB manifest:', epub.manifest);

                // Try to get content using different methods
        let content = '';

        try {
          // Method 1: Try to get first chapter from TOC
          if (toc && toc.length > 0) {
            const firstChapter = toc[0];
            console.log('Reading first chapter from TOC:', firstChapter);

            // Try different ways to get chapter content
            try {
              // Method 1a: Try getChapterRaw
              content = await new Promise((resolve, reject) => {
                epub.getChapterRaw(firstChapter.id, (err, text) => {
                  if (err) {
                    console.warn('getChapterRaw failed:', err);
                    resolve('');
                  } else {
                    console.log('getChapterRaw success, content length:', text ? text.length : 0);
                    resolve(text || '');
                  }
                });
              });
            } catch (method1Error) {
              console.warn('Method 1a failed:', method1Error);
            }

            // Method 1b: Try getChapter if getChapterRaw failed
            if (!content) {
              try {
                content = await new Promise((resolve, reject) => {
                  epub.getChapter(firstChapter.id, (err, text) => {
                    if (err) {
                      console.warn('getChapter failed:', err);
                      resolve('');
                    } else {
                      console.log('getChapter success, content length:', text ? text.length : 0);
                      resolve(text || '');
                    }
                  });
                });
              } catch (method1bError) {
                console.warn('Method 1b failed:', method1bError);
              }
            }
          }
        } catch (tocError) {
          console.warn('Error reading from TOC:', tocError);
        }

        // Method 2: Try to get content from spine
        if (!content) {
          try {
            const spine = epub.spine;
            if (spine && spine.length > 0) {
              const firstSpine = spine[0];
              console.log('Reading first spine item:', firstSpine);

              try {
                content = await new Promise((resolve, reject) => {
                  epub.getChapterRaw(firstSpine.id, (err, text) => {
                    if (err) {
                      console.warn('getChapterRaw from spine failed:', err);
                      resolve('');
                    } else {
                      console.log('getChapterRaw from spine success, content length:', text ? text.length : 0);
                      resolve(text || '');
                    }
                  });
                });
              } catch (spineMethodError) {
                console.warn('Spine method failed:', spineMethodError);
              }
            }
          } catch (spineError) {
            console.warn('Error reading from spine:', spineError);
          }
        }

        // Method 3: Try to get any available content from manifest
        if (!content) {
          try {
            const availableIds = epub.manifest ? Object.keys(epub.manifest) : [];
            console.log('Available manifest IDs:', availableIds);

            if (availableIds.length > 0) {
              const firstId = availableIds[0];
              console.log('Trying to read first available ID:', firstId);

              try {
                content = await new Promise((resolve, reject) => {
                  epub.getChapterRaw(firstId, (err, text) => {
                    if (err) {
                      console.warn('getChapterRaw from manifest failed:', err);
                      resolve('');
                    } else {
                      console.log('getChapterRaw from manifest success, content length:', text ? text.length : 0);
                      resolve(text || '');
                    }
                  });
                });
              } catch (manifestMethodError) {
                console.warn('Manifest method failed:', manifestMethodError);
              }
            }
          } catch (manifestError) {
            console.warn('Error reading from manifest:', manifestError);
          }
        }

                if (content) {
          // Clean HTML content and extract text
          content = content.replace(/<[^>]*>/g, '\n').replace(/\n+/g, '\n').trim();
          console.log('Successfully extracted EPUB content, length:', content.length);

          return {
            content,
            type: 'epub',
            metadata: metadata,
            toc: toc,
            encoding: 'utf8'
          };
        } else {
          console.log('No content could be extracted from EPUB');

          // Create a fallback content with available information
          let fallbackContent = '📚 EPUB 书籍信息\n\n';

          if (metadata && metadata.title) {
            fallbackContent += `📖 标题：${metadata.title}\n`;
          }
          if (metadata && metadata.creator) {
            fallbackContent += `👤 作者：${metadata.creator}\n`;
          }
          if (metadata && metadata.publisher) {
            fallbackContent += `🏢 出版社：${metadata.publisher}\n`;
          }
          if (metadata && metadata.language) {
            fallbackContent += `🌍 语言：${metadata.language}\n`;
          }

          fallbackContent += '\n📋 目录信息：\n';
          if (toc && toc.length > 0) {
            toc.forEach((item, index) => {
              fallbackContent += `${index + 1}. ${item.title || item.label || '未知章节'}\n`;
            });
          } else {
            fallbackContent += '暂无目录信息\n';
          }

          fallbackContent += '\n⚠️ 注意：无法读取书籍正文内容，但文件已成功添加到书架。\n';
          fallbackContent += '这可能是由于EPUB文件格式问题或文件损坏导致的。\n';
          fallbackContent += '建议尝试其他EPUB文件或检查当前文件是否完整。';

          return {
            content: fallbackContent,
            type: 'epub',
            metadata: metadata,
            toc: toc
          };
        }
      } catch (epubError) {
        console.error('Error reading EPUB:', epubError);
        return {
          content: `读取EPUB文件时出错: ${epubError.message}\n\n文件已添加到书架，但无法预览内容。\n\n请检查EPUB文件是否完整且未损坏。`,
          type: 'epub_error'
        };
      }
    }

    // For other formats, return basic info for now
    return {
      content: '此格式暂不支持预览，但已成功添加到书架。',
      type: 'unsupported'
    };
  } catch (error) {
    console.error('Error reading book content:', error);
    throw new Error(`读取文件失败: ${error.message}`);
  }
});

// IPC handlers for file operations (reading progress)
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return content;
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error reading file:', error);
    throw new Error(`读取文件失败: ${error.message}`);
  }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing file:', error);
    throw new Error(`写入文件失败: ${error.message}`);
  }
});

// WebDAV connection test
ipcMain.handle('test-webdav-connection', async (event, config) => {
  try {
    console.log('Testing WebDAV connection with config:', {
      webdavPath: config.webdavPath,
      username: config.username,
      enabled: config.enabled
    });

    if (!config.enabled) {
      return { success: false, message: 'WebDAV同步未启用' };
    }

    if (!config.webdavPath || !config.username || !config.password) {
      return { success: false, message: '请填写完整的WebDAV配置信息' };
    }

    // Get local settings to check WebDAV folder path
    const localSettings = loadLocalSettings();
    if (!localSettings.webdavFolderPath) {
      return { success: false, message: '请先选择WebDAV同步文件夹' };
    }

    // Create WebDAV client using the configured path
    const client = createClient(config.webdavPath, {
      username: config.username,
      password: config.password
    });

    // Test connection by listing the root of the configured WebDAV path
    const items = await client.getDirectoryContents('/');

    console.log('WebDAV connection test successful, found items:', items.length);

    return {
      success: true,
      message: `连接成功！在WebDAV路径 "${config.webdavPath}" 中找到 ${items.length} 个项目`,
      items: items.length
    };
  } catch (error) {
    console.error('WebDAV connection test failed:', error);

    let errorMessage = '连接失败';
    if (error.message.includes('401')) {
      errorMessage = '认证失败，请检查用户名和密码';
    } else if (error.message.includes('404')) {
      errorMessage = 'WebDAV路径或文件夹不存在，请检查路径和文件夹设置';
    } else if (error.message.includes('ECONNREFUSED')) {
      errorMessage = '无法连接到WebDAV服务器，请检查网络和路径';
    } else if (error.message.includes('ENOTFOUND')) {
      errorMessage = 'WebDAV路径解析失败，请检查路径设置';
    } else {
      errorMessage = `连接失败: ${error.message}`;
    }

    return { success: false, message: errorMessage };
  }
});



// WebDAV upload all files
ipcMain.handle('upload-all-to-webdav', async (event, config) => {
  try {
    console.log('Starting WebDAV upload all with config:', {
      webdavPath: config.webdavPath,
      username: config.username,
      enabled: config.enabled
    });

    if (!config.enabled) {
      return { success: false, message: 'WebDAV同步未启用' };
    }

    if (!config.webdavPath || !config.username || !config.password) {
      return { success: false, message: '请填写完整的WebDAV配置信息' };
    }

    // Create WebDAV client using the configured path
    const client = createClient(config.webdavPath, {
      username: config.username,
      password: config.password
    });

    // Get local settings to check WebDAV folder path
    const localSettings = loadLocalSettings();
    if (!localSettings.webdavFolderPath) {
      return { success: false, message: '请先选择WebDAV同步文件夹' };
    }

    // Check if local folder exists
    if (!fs.existsSync(localSettings.webdavFolderPath)) {
      return { success: false, message: '本地同步文件夹不存在' };
    }

    // Get all local files from the user's selected folder
    const localFiles = fs.readdirSync(localSettings.webdavFolderPath).filter(file =>
      file.endsWith('.txt') || file.endsWith('.epub') || file.endsWith('.pdf') || file.endsWith('.mobi') || file.endsWith('.json')
    );

    console.log(`Found ${localFiles.length} local files in ${localSettings.webdavFolderPath}`);

    // Upload all local files
    let uploadedCount = 0;

    for (const fileName of localFiles) {
      const localPath = path.join(localSettings.webdavFolderPath, fileName);
      const remotePath = `/${fileName}`; // Upload to root of WebDAV path

      try {
        const fileBuffer = fs.readFileSync(localPath);
        await client.putFileContents(remotePath, fileBuffer);
        console.log(`Uploaded file: ${fileName}`);
        uploadedCount++;
      } catch (error) {
        console.error(`Failed to upload file ${fileName}:`, error);
      }
    }

    return {
      success: true,
      message: `全量上传完成！共上传 ${uploadedCount} 个文件`,
      uploaded: uploadedCount
    };
  } catch (error) {
    console.error('WebDAV upload all failed:', error);
    return { success: false, message: `全量上传失败: ${error.message}` };
  }
});

// WebDAV download all files
ipcMain.handle('download-all-from-webdav', async (event, config) => {
  try {
    console.log('Starting WebDAV download all with config:', {
      webdavPath: config.webdavPath,
      username: config.username,
      enabled: config.enabled
    });

    if (!config.enabled) {
      return { success: false, message: 'WebDAV同步未启用' };
    }

    if (!config.webdavPath || !config.username || !config.password) {
      return { success: false, message: '请填写完整的WebDAV配置信息' };
    }

    // Create WebDAV client using the configured path
    const client = createClient(config.webdavPath, {
      username: config.username,
      password: config.password
    });

    // Get local settings to check WebDAV folder path
    const localSettings = loadLocalSettings();
    if (!localSettings.webdavFolderPath) {
      return { success: false, message: '请先选择WebDAV同步文件夹' };
    }

    // Ensure local folder exists
    if (!fs.existsSync(localSettings.webdavFolderPath)) {
      fs.mkdirSync(localSettings.webdavFolderPath, { recursive: true });
    }

    // Get remote files from the root of WebDAV path
    let remoteItems = [];
    try {
      remoteItems = await client.getDirectoryContents('/');
    } catch (error) {
      console.log('No remote files found');
      return { success: false, message: '远程文件夹不存在或为空' };
    }

    const remoteFiles = remoteItems.filter(item => item.type === 'file' &&
      (item.basename.endsWith('.txt') || item.basename.endsWith('.epub') ||
        item.basename.endsWith('.pdf') || item.basename.endsWith('.mobi') || item.basename.endsWith('.json'))
    );

    console.log(`Found ${remoteFiles.length} remote files`);

    // Download all remote files
    let downloadedCount = 0;
    let bookJsonOverwritten = false;

    for (const remoteFile of remoteFiles) {
      const localPath = path.join(localSettings.webdavFolderPath, remoteFile.basename);
      const remotePath = remoteFile.filename;

      try {
        const fileBuffer = await client.getFileContents(remotePath);
        fs.writeFileSync(localPath, fileBuffer);
        console.log(`Downloaded file: ${remoteFile.basename}`);
        downloadedCount++;

        // Check if book.json was overwritten
        if (remoteFile.basename === 'book.json') {
          bookJsonOverwritten = true;
        }
      } catch (error) {
        console.error(`Failed to download file ${remoteFile.basename}:`, error);
      }
    }

    let message = `全量下载完成！共下载 ${downloadedCount} 个文件`;
    if (bookJsonOverwritten) {
      message += '（book.json已更新）';
    }

    return {
      success: true,
      message: message,
      downloaded: downloadedCount,
      bookJsonOverwritten: bookJsonOverwritten
    };
  } catch (error) {
    console.error('WebDAV download all failed:', error);
    return { success: false, message: `全量下载失败: ${error.message}` };
  }
});

// Save book progress to cache file
ipcMain.handle('save-book-progress', async (event, bookId, progressData) => {
  try {
    await saveBookProgressToCache(bookId, progressData);
    return { success: true, message: '进度保存成功' };
  } catch (error) {
    console.error('Error saving book progress:', error);
    return { success: false, message: `保存进度失败: ${error.message}` };
  }
});

// Load book progress from cache file
ipcMain.handle('load-book-progress', async (event, bookId) => {
  try {
    const progressData = await loadBookProgressFromCache(bookId);
    return { success: true, data: progressData };
  } catch (error) {
    console.error('Error loading book progress:', error);
    return { success: false, message: `加载进度失败: ${error.message}` };
  }
});

// Upload book cache to WebDAV
ipcMain.handle('upload-book-cache', async (event, bookId) => {
  try {
    await autoUploadBookCacheToWebDAV(bookId);
    return { success: true, message: '进度文件上传成功' };
  } catch (error) {
    console.error('Error uploading book cache:', error);
    return { success: false, message: `上传进度失败: ${error.message}` };
  }
});

// Download book progress from WebDAV
ipcMain.handle('download-book-progress', async (event, bookId) => {
  try {
    const progressData = await autoDownloadBookProgressFromWebDAV(bookId);
    if (progressData) {
      return { success: true, message: '进度文件下载成功', data: progressData };
    } else {
      return { success: false, message: '未找到远程进度文件' };
    }
  } catch (error) {
    console.error('Error downloading book progress:', error);
    return { success: false, message: `下载进度失败: ${error.message}` };
  }
});

// Sync book progress (upload then download to ensure consistency)
ipcMain.handle('sync-book-progress', async (event, bookId) => {
  try {
    // First upload local progress to WebDAV
    await autoUploadBookCacheToWebDAV(bookId);

    // Then download the latest progress from WebDAV
    const progressData = await autoDownloadBookProgressFromWebDAV(bookId);

    if (progressData) {
      return { success: true, message: '进度同步成功', data: progressData };
    } else {
      return { success: true, message: '进度上传成功，但未找到远程进度文件' };
    }
  } catch (error) {
    console.error('Error syncing book progress:', error);
    return { success: false, message: `进度同步失败: ${error.message}` };
  }
});

// IPC handlers for local settings management
ipcMain.handle('get-local-settings', async () => {
  try {
    return loadLocalSettings();
  } catch (error) {
    console.error('Error getting local settings:', error);
    return { success: false, message: `获取设置失败: ${error.message}` };
  }
});

ipcMain.handle('save-local-settings', async (event, settings) => {
  try {
    saveLocalSettings(settings);
    return { success: true, message: '设置保存成功' };
  } catch (error) {
    console.error('Error saving local settings:', error);
    return { success: false, message: `保存设置失败: ${error.message}` };
  }
});

// Save WebDAV config to local settings
ipcMain.handle('save-webdav-config', async (event, webdavConfig) => {
  try {
    const localSettings = loadLocalSettings();
    localSettings.webdavConfig = webdavConfig;
    saveLocalSettings(localSettings);
    return { success: true, message: 'WebDAV配置已保存' };
  } catch (error) {
    console.error('Error saving WebDAV config:', error);
    return { success: false, message: `保存WebDAV配置失败: ${error.message}` };
  }
});


