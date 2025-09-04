import React, { useState, useEffect } from 'react';
import { Link } from '@tanstack/react-router';

interface Book {
  id: string;
  title: string;
  author?: string;
  fileName: string;
  filePath: string;
  size: number;
  addedAt: string;
  metadata?: any; // For EPUB metadata
  toc?: any[]; // For EPUB table of contents
  showDropdown?: boolean; // For dropdown menu state
  readingProgress?: {
    progress: number; // 0-100 percentage
    lastReadAt: string;
    readingTime: number; // in minutes
  };
}

declare global {
  interface Window {
    electronAPI: {
      openBookDialog: () => Promise<string | null>;
      copyBookToLibrary: (sourcePath: string) => Promise<{ success: boolean; message: string; book?: Book; existingBook?: Book }>;
      getBooks: () => Promise<Book[]>;
      readBookContent: (bookPath: string) => Promise<{
        content: string;
        type: string;
        encoding?: string;
        metadata?: any;
        toc?: any[];
      }>;
      deleteBook: (bookId: string) => Promise<{ success: boolean; message: string }>;
      readFile: (filePath: string) => Promise<string | null>;
      writeFile: (filePath: string, content: string) => Promise<boolean>;
      testWebDAVConnection: (config: any) => Promise<{ success: boolean; message: string; items?: number }>;
      uploadAllToWebDAV: (config: any) => Promise<{ success: boolean; message: string; uploaded?: number }>;
      downloadAllFromWebDAV: (config: any) => Promise<{ success: boolean; message: string; downloaded?: number; bookJsonOverwritten?: boolean }>;
      saveBookProgress: (bookId: string, progressData: any) => Promise<{ success: boolean; message: string }>;
      loadBookProgress: (bookId: string) => Promise<{ success: boolean; data?: any; message?: string }>;
      uploadBookCache: (bookId: string) => Promise<{ success: boolean; message: string }>;
      downloadBookProgress: (bookId: string) => Promise<{ success: boolean; message: string; data?: any }>;
      syncBookProgress: (bookId: string) => Promise<{ success: boolean; message: string; data?: any }>;
      getLocalSettings: () => Promise<any>;
      saveLocalSettings: (settings: any) => Promise<{ success: boolean; message: string }>;
      selectWebDAVFolder: () => Promise<string | null>;
      saveWebDAVConfig: (config: any) => Promise<{ success: boolean; message: string }>;
      importTxtContent: (fileName: string, content: string) => Promise<{ success: boolean; message: string; book?: Book; existingBook?: Book }>;
    };
  }
}

const Bookshelf: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showWebDAVConfig, setShowWebDAVConfig] = useState(false);
  const [showFirstRunSetup, setShowFirstRunSetup] = useState(false);
  const [localSettings, setLocalSettings] = useState({
    webdavFolderPath: null as string | null,
    isFirstRun: true,
    lastUpdated: ''
  });
  const [webdavConfig, setWebdavConfig] = useState({
    webdavPath: '',
    username: '',
    password: ''
  });
  const [isWebdavConfigDirty, setIsWebdavConfigDirty] = useState(false);
  const [showWebDAVFolderModal, setShowWebDAVFolderModal] = useState(false);
  const [webdavSaveTimeout, setWebdavSaveTimeout] = useState<NodeJS.Timeout | null>(null);
  const [showAutoSaveIndicator, setShowAutoSaveIndicator] = useState(false);



  useEffect(() => {
    const initializeBookshelf = async () => {
      // Load local settings first
      await loadLocalSettings();
      // Then load books
      await loadBooks();
    };

    initializeBookshelf();
  }, []);

  // Always load WebDAV config once on mount
  useEffect(() => {
    loadWebDAVConfig();
  }, []);

  // Load WebDAV config when opening the modal if the user hasn't edited fields
  useEffect(() => {
    if (showWebDAVConfig && !isWebdavConfigDirty) {
      loadWebDAVConfig();
    }
  }, [showWebDAVConfig, isWebdavConfigDirty]);

  // Check for first run after local settings are loaded
  useEffect(() => {
    // Only show on first run when no local storage path is configured yet
    if (localSettings.isFirstRun && !localSettings.webdavFolderPath && !loading) {
      setShowFirstRunSetup(true);
    } else {
      setShowFirstRunSetup(false);
    }
  }, [localSettings.isFirstRun, localSettings.webdavFolderPath, loading]);

  // Reload books when page becomes visible (e.g., returning from reading page)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('Page became visible, reloading books to update progress');
        loadBooks();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also reload when window gains focus
    const handleFocus = () => {
      console.log('Window gained focus, reloading books to update progress');
      loadBooks();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Close book dropdowns
      setBooks(prevBooks =>
        prevBooks.map(book => ({ ...book, showDropdown: false }))
      );
      // Close main dropdown if clicking outside
      if (!target.closest('[data-dropdown]')) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // Cleanup timeout on component unmount
  useEffect(() => {
    return () => {
      if (webdavSaveTimeout) {
        clearTimeout(webdavSaveTimeout);
      }
    };
  }, [webdavSaveTimeout]);

    const loadBooks = async () => {
    try {
      if (window.electronAPI) {
        console.log('Loading books from library...');
                const libraryBooks = await window.electronAPI.getBooks();
        console.log('Received library books:', libraryBooks);

        // Ensure all books have showDropdown: false
        const booksWithDropdownState = libraryBooks.map(book => ({ ...book, showDropdown: false }));
        console.log('Setting books from library:', booksWithDropdownState);
        setBooks(booksWithDropdownState);
      } else {
        console.log('No electronAPI available');
        setBooks([]);
      }
    } catch (error) {
      console.error('Error loading books:', error);
      setBooks([]);
    } finally {
      setLoading(false);
    }
  };

    const handleAddBook = async () => {
    try {
      if (!window.electronAPI) {
        alert('此功能需要在Electron环境中运行');
        return;
      }

      console.log('Opening book dialog...');
      const filePath = await window.electronAPI.openBookDialog();
      console.log('Selected file path:', filePath);

      if (filePath) {
        console.log('Copying book to library...');
        const result = await window.electronAPI.copyBookToLibrary(filePath);
        console.log('Book copy result:', result);

        if (result.success) {
          // Book was successfully added
          console.log('Book copied successfully, reloading books...');
          const updatedBooks = await window.electronAPI.getBooks();
          console.log('Updated books from library:', updatedBooks);
          // Ensure all books have showDropdown: false
          const booksWithDropdownState = updatedBooks.map(book => ({ ...book, showDropdown: false }));
          setBooks(booksWithDropdownState);

          alert(`✅ ${result.message}`);
        } else {
          // Book already exists
          console.log('Book already exists:', result.existingBook);
          const existingBook = result.existingBook;

          if (existingBook) {
            // Ask user if they want to open the existing book
            const shouldOpen = confirm(`${result.message}\n\n是否要打开这本书？`);
            if (shouldOpen) {
              // Navigate to reading page with the existing book
              window.location.href = `/reading?book=${encodeURIComponent(JSON.stringify(existingBook))}`;
            }
          } else {
            alert(`❌ ${result.message}`);
          }
        }
      }
    } catch (error) {
      console.error('Error adding book:', error);
      alert('添加书籍时出错：' + error);
    }
  };

  // Drag-and-drop TXT import
  useEffect(() => {
    const preventDefault = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'copy';
        }
      } catch {}
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const dt = e.dataTransfer;
        if (!dt || !dt.files || dt.files.length === 0) return;
        if (!window.electronAPI) {
          alert('此功能需要在Electron环境中运行');
          return;
        }

        // Prefer path-based copy when available (Explorer -> Electron provides .path)
        const pathImports: string[] = [];
        const contentFiles: File[] = [];

        for (const f of Array.from(dt.files)) {
          const nameLower = (f.name || '').toLowerCase();
          // @ts-ignore
          const p = (f as any).path as string | undefined;
          if (p) {
            if (p.toLowerCase().endsWith('.txt') || nameLower.endsWith('.txt')) {
              pathImports.push(p);
            }
          } else if (nameLower.endsWith('.txt')) {
            contentFiles.push(f as File);
          }
        }

        let successCount = 0;
        let failCount = 0;

        // 1) Import using file paths when possible
        if (pathImports.length > 0) {
          for (const p of Array.from(new Set(pathImports))) {
            try {
              const result = await window.electronAPI.copyBookToLibrary(p);
              if (result.success) successCount++; else failCount++;
            } catch {
              failCount++;
            }
          }
        }

        // 2) Fallback to content-based import for files without path
        if (contentFiles.length > 0) {
          for (const f of contentFiles) {
            try {
              const fileName = f.name || '未命名.txt';
              // Some environments may not support File.text; use FileReader if needed
              const text = await (f as any).text?.() ?? await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onerror = () => reject(new Error('读取文件失败'));
                reader.onload = () => resolve(String(reader.result || ''));
                reader.readAsText(f);
              });
              const result = await window.electronAPI.importTxtContent(fileName, text);
              if (result.success) successCount++; else failCount++;
            } catch {
              failCount++;
            }
          }
        }

        // 3) If neither path nor content determined, try URIs
        if (pathImports.length === 0 && contentFiles.length === 0) {
          const rawUris = dt.getData('text/uri-list') || dt.getData('text/plain') || '';
          const lines = rawUris
            .split('\n')
            .map(l => l.trim())
            .filter(l => l && !l.startsWith('#'));
          const candidates: string[] = [];
          for (const line of lines) {
            let cand: string | null = null;
            if (line.toLowerCase().startsWith('file:')) {
              try {
                let decoded = decodeURI(line.replace(/^file:\/\//, ''));
                if (/^\/[a-zA-Z]:\//.test(decoded)) decoded = decoded.substring(1);
                cand = decoded;
              } catch {
                cand = null;
              }
            } else {
              cand = line;
            }
            if (cand && cand.toLowerCase().endsWith('.txt')) {
              candidates.push(cand);
            }
          }
          if (candidates.length === 0) {
            alert('仅支持拖拽TXT文件导入');
            return;
          }
          for (const p of Array.from(new Set(candidates))) {
            try {
              const result = await window.electronAPI.copyBookToLibrary(p);
              if (result.success) successCount++; else failCount++;
            } catch {
              failCount++;
            }
          }
        }

        // Refresh bookshelf
        const updatedBooks = await window.electronAPI.getBooks();
        const booksWithDropdownState = updatedBooks.map(book => ({ ...book, showDropdown: false }));
        setBooks(booksWithDropdownState);
        alert(`导入完成：成功 ${successCount}，失败 ${failCount}`);
      } catch (err) {
        console.error('Drag-and-drop import error:', err);
        alert('拖拽导入失败：' + err);
      }
    };

    window.addEventListener('dragover', preventDefault as any);
    window.addEventListener('drop', handleDrop as any);
    document.addEventListener('dragenter', preventDefault as any);
    document.addEventListener('dragleave', preventDefault as any);
    document.addEventListener('dragover', preventDefault as any);

    return () => {
      window.removeEventListener('dragover', preventDefault as any);
      window.removeEventListener('drop', handleDrop as any);
      document.removeEventListener('dragenter', preventDefault as any);
      document.removeEventListener('dragleave', preventDefault as any);
      document.removeEventListener('dragover', preventDefault as any);
    };
  }, []);

  // Local settings functions
  const loadLocalSettings = async () => {
    try {
      if (window.electronAPI) {
        const settings = await window.electronAPI.getLocalSettings();
        setLocalSettings(settings);
        console.log('Local settings loaded:', settings);
      }
    } catch (error) {
      console.error('Error loading local settings:', error);
    }
  };

  const saveLocalSettings = async (newSettings: any) => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.saveLocalSettings(newSettings);
        if (result.success) {
          setLocalSettings(newSettings);
          console.log('Local settings saved:', newSettings);
        } else {
          console.error('Failed to save local settings:', result.message);
        }
      }
    } catch (error) {
      console.error('Error saving local settings:', error);
    }
  };

  const handleSelectWebDAVFolder = async () => {
    try {
      if (!window.electronAPI) {
        alert('此功能需要在Electron环境中运行');
        return;
      }

      const folderPath = await window.electronAPI.selectWebDAVFolder();
      if (folderPath) {
        const newSettings = {
          ...localSettings,
          webdavFolderPath: folderPath,
          isFirstRun: false
        };
        await saveLocalSettings(newSettings);
        setShowFirstRunSetup(false);
        setShowWebDAVFolderModal(false);

        // Reload books after changing the storage path
        console.log('Storage path changed, reloading books...');
        await loadBooks();

        alert(`WebDAV同步文件夹已设置为：${folderPath}`);
      }
    } catch (error) {
      console.error('Error selecting WebDAV folder:', error);
      alert('选择文件夹时出错：' + error);
    }
  };

  // WebDAV configuration functions
  const loadWebDAVConfig = async () => {
    try {
      if (window.electronAPI) {
        // Load WebDAV config from local settings
        const currentLocalSettings = await window.electronAPI.getLocalSettings();
        if (currentLocalSettings.webdavConfig) {
          // Remove enabled field from UI state, it's handled automatically
          const { enabled, ...configWithoutEnabled } = currentLocalSettings.webdavConfig;
          setWebdavConfig(configWithoutEnabled);
        }
      }
    } catch (error) {
      console.error('Error loading WebDAV config:', error);
    }
  };



  // Auto-save WebDAV config with debounce
  const autoSaveWebDAVConfig = async (newConfig: any) => {
    try {
      if (window.electronAPI) {
        // Clear existing timeout
        if (webdavSaveTimeout) {
          clearTimeout(webdavSaveTimeout);
        }

        // Set new timeout for auto-save
        const timeout = setTimeout(async () => {
          try {
            // Auto-enable WebDAV when configuration is provided
            const configToSave = {
              ...newConfig,
              enabled: !!(newConfig.webdavPath && newConfig.username && newConfig.password)
            };

            const result = await window.electronAPI.saveWebDAVConfig(configToSave);
            if (result.success) {
              console.log('WebDAV配置已自动保存');
              // Show auto-save indicator
              setShowAutoSaveIndicator(true);
              setTimeout(() => setShowAutoSaveIndicator(false), 2000);
            } else {
              console.error('自动保存WebDAV配置失败：', result.message);
            }
          } catch (error) {
            console.error('自动保存WebDAV配置时出错：', error);
          }
        }, 1000); // 1秒防抖

        setWebdavSaveTimeout(timeout);
      }
    } catch (error) {
      console.error('Error setting up auto-save for WebDAV config:', error);
    }
  };

  const testWebDAVConnection = async () => {
    try {
      if (!window.electronAPI) {
        alert('此功能需要在Electron环境中运行');
        return;
      }

      // Ensure local settings are up to date before testing
      await loadLocalSettings();

      console.log('Testing WebDAV connection with config:', webdavConfig);
      console.log('Current local settings:', localSettings);

      const result = await window.electronAPI.testWebDAVConnection(webdavConfig);

      if (result.success) {
        alert(`✅ ${result.message}`);
      } else {
        alert(`❌ ${result.message}`);
      }
    } catch (error) {
      console.error('Error testing WebDAV connection:', error);
      alert('WebDAV连接测试失败：' + error);
    }
  };



  const uploadAllToWebDAV = async () => {
    try {
      if (!window.electronAPI) {
        alert('此功能需要在Electron环境中运行');
        return;
      }

      // Ensure local settings are up to date before uploading
      await loadLocalSettings();

      console.log('Starting WebDAV upload with config:', webdavConfig);
      console.log('Current local settings:', localSettings);

      const result = await window.electronAPI.uploadAllToWebDAV(webdavConfig);

      if (result.success) {
        alert(`✅ ${result.message}`);
      } else {
        alert(`❌ ${result.message}`);
      }
    } catch (error) {
      console.error('Error uploading to WebDAV:', error);
      alert('WebDAV上传失败：' + error);
    }
  };

  const downloadAllFromWebDAV = async () => {
    try {
      if (!window.electronAPI) {
        alert('此功能需要在Electron环境中运行');
        return;
      }

      // Ensure local settings are up to date before downloading
      await loadLocalSettings();

      console.log('Starting WebDAV download with config:', webdavConfig);
      console.log('Current local settings:', localSettings);

      const result = await window.electronAPI.downloadAllFromWebDAV(webdavConfig);

      if (result.success) {
        alert(`✅ ${result.message}`);
        // Reload books after download to reflect any changes
        loadBooks();
      } else {
        alert(`❌ ${result.message}`);
      }
    } catch (error) {
      console.error('Error downloading from WebDAV:', error);
      alert('WebDAV下载失败：' + error);
    }
  };

  const handleViewBookInfo = (book: Book) => {
    const info = `
📚 书籍信息

📖 标题：${book.title}
👤 作者：${book.author || '未知'}
📁 文件名：${book.fileName}
💾 文件大小：${formatFileSize(book.size)}
📅 添加时间：${new Date(book.addedAt).toLocaleString('zh-CN')}
🆔 书籍ID：${book.id}
    `;

    alert(info);
  };

  const handleDeleteBook = async (bookId: string, bookTitle: string) => {
    try {
      if (!window.electronAPI) {
        alert('此功能需要在Electron环境中运行');
        return;
      }

      // Confirm deletion
      const confirmed = window.confirm(`确定要删除《${bookTitle}》吗？\n\n删除后无法恢复，源文件也会被删除。`);
      if (!confirmed) {
        return;
      }

      console.log('Deleting book with ID:', bookId);
      const result = await window.electronAPI.deleteBook(bookId);

      if (result.success) {
        console.log('Book deleted successfully');
        alert('书籍删除成功！');

        // Reload books list
        const updatedBooks = await window.electronAPI.getBooks();
        // Ensure all books have showDropdown: false
        const booksWithDropdownState = updatedBooks.map(book => ({ ...book, showDropdown: false }));
        setBooks(booksWithDropdownState);
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error('Error deleting book:', error);
      alert('删除书籍时出错：' + error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };



  return (
    <>
      {/* CSS Animations */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      <div style={{
        padding: '20px',
        minHeight: 'calc(100vh - 80px)'
      }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '30px'
      }}>
        <h1 style={{
          color: '#333',
          fontSize: '24px',
          fontWeight: 'normal',
          margin: 0
        }}>
          我的书架
        </h1>

        <div style={{ position: 'relative' }} data-dropdown>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            style={{
              padding: '10px 20px',
              backgroundColor: '#4a90e2',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'background-color 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#357abd';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#4a90e2';
            }}
          >
            + 添加书籍
            <span style={{ fontSize: '12px' }}>▼</span>
          </button>

          {showDropdown && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: '0',
              marginTop: '5px',
              backgroundColor: 'white',
              border: '1px solid #ddd',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 1000,
              minWidth: '180px'
            }}>
              <button
                onClick={() => {
                  handleAddBook();
                  setShowDropdown(false);
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  fontSize: '14px',
                  textAlign: 'left',
                  borderBottom: '1px solid #f0f0f0',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f8f9fa';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                📁 导入本地书籍
              </button>
              <button
                onClick={() => {
                  setShowWebDAVFolderModal(true);
                  setShowDropdown(false);
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  fontSize: '14px',
                  textAlign: 'left',
                  borderBottom: '1px solid #f0f0f0',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f8f9fa';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                📂 设置存储路径
              </button>
              <button
                onClick={() => {
                  setShowWebDAVConfig(true);
                  setShowDropdown(false);
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  fontSize: '14px',
                  textAlign: 'left',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f8f9fa';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                ☁️ 配置WebDAV同步
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{
          textAlign: 'center',
          padding: '50px',
          color: '#666'
        }}>
          <div style={{
            fontSize: '18px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px'
          }}>
            <div style={{
              width: '20px',
              height: '20px',
              border: '2px solid #e5e7eb',
              borderTop: '2px solid #4a90e2',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
            正在加载书籍...
          </div>
          <div style={{ fontSize: '14px', color: '#999' }}>
            正在读取本地设置和书籍列表
          </div>
        </div>
      ) : books.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '50px',
          color: '#666'
        }}>
          <div style={{ fontSize: '18px', marginBottom: '20px' }}>
            书架空空如也
          </div>
          <div style={{ fontSize: '14px', color: '#999' }}>
            点击上方"添加本地书籍"按钮开始添加您的第一本书
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: '20px',
          maxWidth: '1200px'
        }}>
          {books.map((book) => (
            <div key={book.id} style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '10px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'transform 0.2s',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
            }}
            >
              {/* More options button */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Toggle dropdown for this book
                  setBooks(prevBooks =>
                    prevBooks.map(b =>
                      b.id === book.id
                        ? { ...b, showDropdown: !b.showDropdown }
                        : { ...b, showDropdown: false }
                    )
                  );
                }}
                style={{
                  position: 'absolute',
                  top: '5px',
                  right: '5px',
                  width: '24px',
                  height: '24px',
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10,
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
                }}
                title="更多选项"
              >
                ⋯
              </button>

              {/* Dropdown menu */}
              {book.showDropdown && (
                <div
                  style={{
                    position: 'absolute',
                    top: '35px',
                    right: '5px',
                    backgroundColor: 'white',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 20,
                    minWidth: '140px',
                    overflow: 'hidden'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* View book info */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleViewBookInfo(book);
                      // Close dropdown
                      setBooks(prevBooks =>
                        prevBooks.map(b => ({ ...b, showDropdown: false }))
                      );
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      cursor: 'pointer',
                      fontSize: '12px',
                      textAlign: 'left',
                      color: '#333',
                      borderBottom: '1px solid #eee',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f5f5f5';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    📖 查看书籍信息
                  </button>

                  {/* Delete book */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDeleteBook(book.id, book.title);
                      // Close dropdown
                      setBooks(prevBooks =>
                        prevBooks.map(b => ({ ...b, showDropdown: false }))
                      );
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      cursor: 'pointer',
                      fontSize: '12px',
                      textAlign: 'left',
                      color: '#e74c3c',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#fdf2f2';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    🗑️ 删除书籍
                  </button>
                </div>
              )}

              <Link
                to="/reading"
                search={{ bookId: book.id }}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{
                  width: '100%',
                  height: '160px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '4px',
                  marginBottom: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px dashed #dee2e6'
                }}>
                  <div style={{
                    textAlign: 'center',
                    color: '#6c757d'
                  }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>📚</div>
                    <div style={{ fontSize: '12px' }}>{book.fileName.split('.').pop()?.toUpperCase() || 'BOOK'}</div>
                  </div>
                </div>
                <h3 style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  marginBottom: '4px',
                  color: '#333',
                  lineHeight: '1.3',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {book.title}
                </h3>
                <p style={{
                  fontSize: '12px',
                  color: '#666',
                  marginBottom: '4px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {book.author || '未知作者'}
                </p>
                <p style={{
                  fontSize: '10px',
                  color: '#999',
                  marginBottom: '8px'
                }}>
                  {formatFileSize(book.size)}
                </p>
                {typeof (book as any).readingProgressPercent === 'number' && (
                  <div style={{
                    fontSize: '12px',
                    color: '#999'
                  }}>
                    进度: {(book as any).readingProgressPercent.toFixed(2)}%
                    <div style={{
                      width: '100%',
                      height: '4px',
                      backgroundColor: '#eee',
                      borderRadius: '2px',
                      marginTop: '4px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${(book as any).readingProgressPercent}%`,
                        height: '100%',
                        backgroundColor: '#4a90e2',
                        transition: 'width 0.3s'
                      }} />
                    </div>
                  </div>
                )}
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* WebDAV Folder Modal */}
      {showWebDAVFolderModal && (
        <>
          {/* Overlay */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(4px)',
              zIndex: 2100
            }}
            onClick={() => setShowWebDAVFolderModal(false)}
          />

          {/* Modal */}
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: '0',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            zIndex: 2101,
            minWidth: '560px',
            maxWidth: '680px',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              padding: '20px 28px',
              color: 'white',
              textAlign: 'center',
              position: 'relative'
            }}>
              <button
                onClick={() => setShowWebDAVFolderModal(false)}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  width: '32px',
                  height: '32px',
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  fontSize: '16px'
                }}
              >
                ×
              </button>
              <h3 style={{ margin: 0, fontSize: '20px' }}>设置存储路径</h3>
              <p style={{ margin: '6px 0 0 0', fontSize: '12px', opacity: 0.9 }}>选择本地用于同步的文件夹路径</p>
            </div>

            {/* Body */}
            <div style={{ padding: '24px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '12px'
              }}>
                <input
                  type="text"
                  value={localSettings.webdavFolderPath || ''}
                  readOnly
                  placeholder="请选择本地同步文件夹"
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    backgroundColor: '#f9fafb',
                    color: '#6b7280'
                  }}
                />
                <button
                  onClick={handleSelectWebDAVFolder}
                  style={{
                    padding: '12px 20px',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  选择文件夹
                </button>
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                此设置仅保存在本地，用于与 WebDAV 服务器同步目录对应。
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 24px',
              backgroundColor: '#f8fafc',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px'
            }}>
              <button
                onClick={() => setShowWebDAVFolderModal(false)}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#e5e7eb',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                关闭
              </button>
            </div>
          </div>
        </>
      )}

      {/* WebDAV Configuration Modal */}
      {showWebDAVConfig && (
        <>
          {/* Overlay */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(4px)',
              zIndex: 2000,
              animation: 'fadeIn 0.3s ease-out'
            }}
            onClick={() => setShowWebDAVConfig(false)}
          />

          {/* Modal */}
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: '0',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            zIndex: 2001,
            minWidth: '680px',
            maxWidth: '720px',
            maxHeight: '90vh',
            overflow: 'hidden',
            animation: 'slideIn 0.3s ease-out'
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              padding: '24px 32px',
              color: 'white',
              textAlign: 'center',
              position: 'relative'
            }}>
              <button
                onClick={() => setShowWebDAVConfig(false)}
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  width: '32px',
                  height: '32px',
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                }}
              >
                ×
              </button>
              <h2 style={{
                margin: '0',
                fontSize: '24px',
                fontWeight: '600',
                letterSpacing: '0.5px'
              }}>
                ☁️ WebDAV 同步配置
                {showAutoSaveIndicator && (
                  <span style={{
                    marginLeft: '12px',
                    fontSize: '14px',
                    opacity: '0.9',
                    fontWeight: '400'
                  }}>
                    ✅ 已自动保存
                  </span>
                )}
              </h2>
              <p style={{
                margin: '8px 0 0 0',
                fontSize: '14px',
                opacity: '0.9'
              }}>
                配置云端同步，让您的阅读数据在多设备间保持同步
              </p>
            </div>

            {/* Content */}
            <div style={{
              padding: '32px',
              maxHeight: 'calc(90vh - 200px)',
              overflowY: 'auto'
            }}>
              {/* Folder selection moved to dedicated modal */}

              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  color: '#374151',
                  marginBottom: '8px',
                  fontWeight: '500'
                }}>
                  📂 WebDAV文件夹路径
                </label>
                <input
                  type="text"
                  value={webdavConfig.webdavPath}
                  onChange={(e) => {
                    const newConfig = { ...webdavConfig, webdavPath: e.target.value };
                    setWebdavConfig(newConfig);
                    setIsWebdavConfigDirty(true);
                    autoSaveWebDAVConfig(newConfig);
                  }}
                  placeholder="https://example.com/dav/books"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                    outline: 'none'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#667eea';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#e5e7eb';
                  }}
                />
                <p style={{
                  margin: '8px 0 0 0',
                  fontSize: '12px',
                  color: '#6b7280',
                  lineHeight: '1.4'
                }}>
                  指定WebDAV服务器上的完整文件夹路径，例如：https://example.com/dav/books
                </p>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  color: '#374151',
                  marginBottom: '8px',
                  fontWeight: '500'
                }}>
                  👤 用户名
                </label>
                <input
                  type="text"
                  value={webdavConfig.username}
                  onChange={(e) => {
                    const newConfig = { ...webdavConfig, username: e.target.value };
                    setWebdavConfig(newConfig);
                    setIsWebdavConfigDirty(true);
                    autoSaveWebDAVConfig(newConfig);
                  }}
                  placeholder="your-username"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                    outline: 'none'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#667eea';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#e5e7eb';
                  }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  color: '#374151',
                  marginBottom: '8px',
                  fontWeight: '500'
                }}>
                  🔒 密码
                </label>
                <input
                  type="password"
                  value={webdavConfig.password}
                  onChange={(e) => {
                    const newConfig = { ...webdavConfig, password: e.target.value };
                    setWebdavConfig(newConfig);
                    setIsWebdavConfigDirty(true);
                    autoSaveWebDAVConfig(newConfig);
                  }}
                  placeholder="your-password"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                    outline: 'none'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#667eea';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#e5e7eb';
                  }}
                />
              </div>


            </div>

            {/* Footer */}
            <div style={{
              padding: '24px 32px',
              backgroundColor: '#f8fafc',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              gap: '12px',
              justifyContent: 'center',
              flexWrap: 'nowrap'
            }}>
              <button
                onClick={testWebDAVConnection}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  minWidth: '140px',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#d97706';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#f59e0b';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                🔗 测试连接
              </button>



              <button
                onClick={uploadAllToWebDAV}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  minWidth: '140px',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#059669';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#10b981';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                ⬆️ 全量上传
              </button>



              <button
                onClick={downloadAllFromWebDAV}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  minWidth: '140px',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#7c3aed';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#8b5cf6';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                ⬇️ 全量下载
              </button>
            </div>
          </div>

          {/* CSS Animations */}
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideIn {
              from {
                opacity: 0;
                transform: translate(-50%, -60%);
              }
              to {
                opacity: 1;
                transform: translate(-50%, -50%);
              }
            }
          `}</style>
        </>
      )}

      {/* First Run Setup Modal */}
      {showFirstRunSetup && (
        <>
          {/* Overlay */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              backdropFilter: 'blur(4px)',
              zIndex: 3000,
              animation: 'fadeIn 0.3s ease-out'
            }}
          />

          {/* Modal */}
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'white',
            borderRadius: '20px',
            padding: '0',
            boxShadow: '0 25px 80px rgba(0, 0, 0, 0.4)',
            zIndex: 3001,
            minWidth: '500px',
            maxWidth: '600px',
            maxHeight: '90vh',
            overflow: 'hidden',
            animation: 'slideIn 0.3s ease-out'
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              padding: '32px',
              color: 'white',
              textAlign: 'center',
              position: 'relative'
            }}>
              <h2 style={{
                margin: '0',
                fontSize: '28px',
                fontWeight: '600',
                letterSpacing: '0.5px'
              }}>
                🎉 欢迎使用电子书阅读器
              </h2>
              <p style={{
                margin: '12px 0 0 0',
                fontSize: '16px',
                opacity: '0.9'
              }}>
                首次使用需要设置WebDAV同步文件夹
              </p>
            </div>

            {/* Content */}
            <div style={{
              padding: '40px 32px',
              textAlign: 'center'
            }}>
              <div style={{
                fontSize: '48px',
                marginBottom: '20px'
              }}>
                📁
              </div>

              <h3 style={{
                margin: '0 0 16px 0',
                fontSize: '20px',
                color: '#333',
                fontWeight: '600'
              }}>
                选择WebDAV同步文件夹
              </h3>

              <p style={{
                margin: '0 0 32px 0',
                fontSize: '14px',
                color: '#666',
                lineHeight: '1.6'
              }}>
                请选择您希望用于WebDAV同步的本地文件夹。<br/>
                这个设置将保存在本地，不会上传到WebDAV服务器。<br/>
                配置的WebDAV文件夹路径将与此本地文件夹进行同步。
              </p>

              <div style={{
                display: 'flex',
                gap: '16px',
                justifyContent: 'center',
                alignItems: 'center'
              }}>
                <button
                  onClick={handleSelectWebDAVFolder}
                  style={{
                    padding: '16px 32px',
                    backgroundColor: '#4a90e2',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    fontWeight: '600',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    boxShadow: '0 4px 12px rgba(74, 144, 226, 0.3)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#357abd';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(74, 144, 226, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#4a90e2';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(74, 144, 226, 0.3)';
                  }}
                >
                  📁 选择文件夹
                </button>

                <button
                  onClick={() => {
                    const newSettings = {
                      ...localSettings,
                      isFirstRun: false
                    };
                    saveLocalSettings(newSettings);
                    setShowFirstRunSetup(false);
                  }}
                  style={{
                    padding: '16px 24px',
                    backgroundColor: '#f3f4f6',
                    color: '#6b7280',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    fontWeight: '500',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#e5e7eb';
                    e.currentTarget.style.color = '#374151';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                    e.currentTarget.style.color = '#6b7280';
                  }}
                >
                  稍后设置
                </button>
              </div>

              <p style={{
                margin: '24px 0 0 0',
                fontSize: '12px',
                color: '#999',
                lineHeight: '1.4'
              }}>
                您可以在设置中随时修改WebDAV同步文件夹路径
              </p>
            </div>
          </div>

          {/* CSS Animations */}
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideIn {
              from {
                opacity: 0;
                transform: translate(-50%, -60%);
              }
              to {
                opacity: 1;
                transform: translate(-50%, -50%);
              }
            }
          `}</style>
        </>
      )}
      </div>
    </>
  );
};

export default Bookshelf;
