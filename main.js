const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const iconv = require('iconv-lite');
const jschardet = require('jschardet');
const isDev = process.env.NODE_ENV === 'development';

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

ipcMain.handle('copy-book-to-library', async (event, sourcePath) => {
  try {
    const bookDir = path.join(__dirname, 'book');
    if (!fs.existsSync(bookDir)) {
      fs.mkdirSync(bookDir, { recursive: true });
    }
    
    const fileName = path.basename(sourcePath);
    const targetPath = path.join(bookDir, fileName);
    
    // Copy file
    fs.copyFileSync(sourcePath, targetPath);
    
    // Return book info
    const stats = fs.statSync(targetPath);
    return {
      id: Date.now(),
      title: path.parse(fileName).name,
      fileName: fileName,
      filePath: targetPath,
      size: stats.size,
      addedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error copying book:', error);
    throw error;
  }
});

ipcMain.handle('get-books', async () => {
  try {
    const bookDir = path.join(__dirname, 'book');
    if (!fs.existsSync(bookDir)) {
      return [];
    }
    
    const files = fs.readdirSync(bookDir);
    const books = files.map(fileName => {
      const filePath = path.join(bookDir, fileName);
      const stats = fs.statSync(filePath);
      return {
        id: fileName.replace(/[^a-zA-Z0-9]/g, ''),
        title: path.parse(fileName).name,
        fileName: fileName,
        filePath: filePath,
        size: stats.size,
        addedAt: stats.birthtime.toISOString()
      };
    });
    
    return books;
  } catch (error) {
    console.error('Error getting books:', error);
    return [];
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