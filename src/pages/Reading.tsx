import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearch } from '@tanstack/react-router';

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
  readingProgress?: {
    lastReadAt: string;
    readingTime: number; // in minutes
  };
  bookmarks?: Bookmark[];
}

interface Bookmark {
  id: string;
  description: string;
  createdAt: string;
  byteOffset?: number;
  offset?: number;
}



interface UserSettings {
  fontSize: number;
  lineHeight: number;
  brightness: number;
  fontFamily: string;
  backgroundColor: string;
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
  lastUpdated: string;
}

// Use the global Window interface defined in Bookshelf.tsx



const Reading: React.FC = () => {
  const search = useSearch({ from: '/reading' });
  const [fontSize, setFontSize] = useState(16);
  const [currentPage, setCurrentPage] = useState(1);
  const [book, setBook] = useState<Book | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [showTableOfContents, setShowTableOfContents] = useState(false);
  const [tableOfContents, setTableOfContents] = useState<{title: string, page: number, offset: number, byteOffset: number}[]>([]);
  const [pageStartByteOffsets, setPageStartByteOffsets] = useState<number[]>([]);
  const [anchorByteOffset, setAnchorByteOffset] = useState<number | null>(null);
  const [totalByteLength, setTotalByteLength] = useState<number>(0);
  const [contentHash, setContentHash] = useState<string>('');
  const isRestoringRef = useRef<boolean>(false);
  const resizeInProgressRef = useRef<boolean>(false);

  const computeContentHash = async (text: string) => {
    try {
      const enc = new TextEncoder();
      const bytes = enc.encode(text);
      const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      setContentHash(hashHex);
      return hashHex;
    } catch (e) {
      console.warn('Failed to compute content hash:', e);
      setContentHash('');
      return '';
    }
  };
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  const [showToolbar, setShowToolbar] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const progressBarRef = useRef<HTMLDivElement>(null);
  // const measureRef = useRef<HTMLDivElement>(null);
  const [progressFilePath, setProgressFilePath] = useState<string>('');
  const [settingsFilePath, setSettingsFilePath] = useState<string>('');
  const [startTime, setStartTime] = useState<Date>(new Date());

  // New state variables for settings
  const [showColorSettings, setShowColorSettings] = useState(false);
  const [showFontSettings, setShowFontSettings] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState('#f8f9fa');
  const [brightness, setBrightness] = useState(100);
  const [lineHeight, setLineHeight] = useState(16);
  const [fontFamily, setFontFamily] = useState('system-ui, -apple-system, sans-serif');
  const [paddingTop, setPaddingTop] = useState(60);
  const [paddingBottom, setPaddingBottom] = useState(60);
  const [paddingLeft, setPaddingLeft] = useState(80);
  const [paddingRight, setPaddingRight] = useState(80);
  const [isBookmarkJumping, setIsBookmarkJumping] = useState(false);
  const webdavSyncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const settingsSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const resizeToastPendingRef = useRef<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    try {
      setToastMessage(msg);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToastMessage(null), 2000);
    } catch {}
  };

  const triggerWebDAVSync = () => {
    try {
      if (!window.electronAPI) return;
      if (webdavSyncTimerRef.current) {
        clearTimeout(webdavSyncTimerRef.current);
      }
      webdavSyncTimerRef.current = setTimeout(async () => {
        try {
          const local = await window.electronAPI.getLocalSettings();
          const cfg = local?.webdavConfig;
          if (cfg?.enabled) {
            console.log('同步当前书籍进度与设置到 WebDAV...');
            // Prefer fine-grained sync: only current book progress and settings
            if (book?.id) {
              try {
                const res1 = await window.electronAPI.syncBookProgress(book.id);
                if (!res1?.success) {
                  console.warn('进度同步失败:', res1?.message);
                }
              } catch (e) {
                console.warn('进度同步异常:', e);
              }
              // Some implementations separate cache upload; call if available
              try {
                const res2 = await window.electronAPI.uploadBookCache(book.id);
                if (!res2?.success) {
                  console.warn('缓存上传失败:', res2?.message);
                }
              } catch (e) {
                console.warn('缓存上传异常:', e);
              }
            }
            // Settings are saved under base path; backend should handle uploading updated settings.json as part of lightweight sync.
          }
        } catch (e) {
          console.error('WebDAV 同步异常:', e);
        }
      }, 1200);
    } catch (e) {
      console.error('安排 WebDAV 同步失败:', e);
    }
  };

  useEffect(() => {
    // Load local settings to get WebDAV folder path
    const initializePaths = async () => {
      try {
        if (window.electronAPI) {
          const localSettings = await window.electronAPI.getLocalSettings();
          const basePath = localSettings.webdavFolderPath || './book';

          setProgressFilePath(`${basePath}/book.json`);
          setSettingsFilePath(`${basePath}/settings.json`);
        } else {
          // Fallback for non-Electron environment
          setProgressFilePath('./book/book.json');
          setSettingsFilePath('./book/settings.json');
        }
      } catch (error) {
        console.error('Error loading local settings:', error);
        // Fallback to default paths
        setProgressFilePath('./book/book.json');
        setSettingsFilePath('./book/settings.json');
      }

      loadBook();
    };

    initializePaths();
    return () => {
      if (webdavSyncTimerRef.current) {
        clearTimeout(webdavSyncTimerRef.current);
      }
      if (settingsSaveTimerRef.current) {
        clearTimeout(settingsSaveTimerRef.current);
      }
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, [search]);

  // Window resize listener with debounce
  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout;

    const handleResize = () => {
      resizeInProgressRef.current = true;
      // Clear the previous timeout
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

      // Set a new timeout to update window size after resize stops
      resizeTimeout = setTimeout(() => {
        // Capture first character position of current page
        setWindowSize({ width: window.innerWidth, height: window.innerHeight });
        // end of resize
        resizeInProgressRef.current = false;
        // Schedule a toast once alignment happens
        resizeToastPendingRef.current = true;
      }, 250); // slightly tighter debounce to reduce perceived lag
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
    };
  }, []);

  // Update reading progress when current page changes
  useEffect(() => {
    if (totalPages > 0) {
      // Progress strictly by byte offsets
      if (pageStartByteOffsets && pageStartByteOffsets.length > 0 && currentPage >= 1 && currentPage <= pageStartByteOffsets.length) {
        const currentByte = pageStartByteOffsets[currentPage - 1];
        // Update progress bar via page index only; precise byte% shown in toasts/bookmarks
        setAnchorByteOffset(currentByte);
      }
    }
  }, [currentPage, totalPages, pageStartByteOffsets, totalByteLength]);


  useEffect(() => {
    if (!content) {
      if (!loading) {
        setPages(['暂无内容']);
        setTotalPages(1);
        setCurrentPage(1);
      }
      return;
    }
    // Avoid re-entrant pagination loops by comparing a simple signature
    const sig = JSON.stringify({
      len: content.length,
      fs: fontSize,
      lh: lineHeight,
      w: windowSize.width,
      h: windowSize.height,
      pt: paddingTop,
      pb: paddingBottom,
      pl: paddingLeft,
      pr: paddingRight
    });
    if ((paginateContent as any)._lastSig === sig) return;
    (paginateContent as any)._lastSig = sig;
    paginateContent(content);
  }, [content, fontSize, lineHeight, windowSize, paddingTop, paddingBottom, paddingLeft, paddingRight, loading]);

  // 移除百分比预加载方案（仅保留字节锚点方案）

  // Load user settings when component mounts
  useEffect(() => {
    if (settingsFilePath) {
      loadUserSettings();
    }
  }, [settingsFilePath]);

  // Load bookmarks after book is loaded (only once)
  useEffect(() => {
    if (book && progressFilePath && !isBookmarkJumping) {
      // Load bookmarks immediately when book is loaded
      loadBookmarks();
    }
  }, [book?.id, progressFilePath]); // Only depend on book.id, not the entire book object

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setCurrentPage(prev => Math.max(1, prev - 1));
        setShowToolbar(false);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setCurrentPage(prev => Math.min(totalPages, prev + 1));
        setShowToolbar(false);
      } else if (event.key === ' ') {
        event.preventDefault();
        setShowToolbar(prev => !prev);
        setShowTableOfContents(false);
      } else if (event.key === 'Escape') {
        setShowTableOfContents(false);
        setShowToolbar(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalPages, currentPage]);

  // Mouse event handlers for progress bar
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !progressBarRef.current) return;

      const rect = progressBarRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, clickX / rect.width));
      const newPage = Math.max(1, Math.min(totalPages, Math.round(percentage * totalPages) + 1));
      setCurrentPage(newPage);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      // Save reading progress after drag ends
      saveReadingProgress(currentPage);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, totalPages]);

            const handleProgressBarMouseDown = (e: React.MouseEvent) => {
    if (!progressBarRef.current) return;

    setIsDragging(true);
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newPage = Math.max(1, Math.min(totalPages, Math.round(percentage * totalPages) + 1));
    setCurrentPage(newPage);

    // Save reading progress after clicking progress bar
    saveReadingProgress(newPage);
  };

  // Handle bookmark functionality
  const handleBookmark = () => {
    setShowBookmarks(true);
  };

  // Add bookmark function
  const addBookmark = async () => {
    if (!book) return;

    try {
      // Determine current byte offset and percentage
      let currentByte: number | null = null;
      if (pageStartByteOffsets && pageStartByteOffsets.length >= currentPage) {
        currentByte = pageStartByteOffsets[currentPage - 1];
      } else if (typeof anchorByteOffset === 'number') {
        currentByte = anchorByteOffset;
      }
      const progressPercentage = ((): number => {
        if (typeof currentByte === 'number' && totalByteLength > 0) {
          return Math.round((currentByte / Math.max(1, totalByteLength - 1)) * 10000) / 100;
        }
        return 0;
      })();
      const newBookmark: Bookmark = {
        id: Date.now().toString(),
        description: `${progressPercentage.toFixed(2)}%`,
        createdAt: new Date().toISOString(),
        byteOffset: typeof currentByte === 'number' ? currentByte : undefined,
        offset: undefined
      };

      // Get current bookmarks
      const currentBookmarks = book.bookmarks || [];
      const updatedBookmarks = [...currentBookmarks, newBookmark];

      // Prepare progress data with updated bookmarks
      const progressData = {
        bookId: book.id,
        anchorByteOffset: typeof currentByte === 'number' ? currentByte : undefined,
        anchorOffset: undefined,
        totalByteLength: totalByteLength || undefined,
        contentHash: contentHash || undefined,
        lastReadAt: new Date().toISOString(),
        readingTime: Math.floor((new Date().getTime() - startTime.getTime()) / (1000 * 60)),
        bookmarks: updatedBookmarks,
        lastUpdated: new Date().toISOString()
      };

      // Save to cache file
      if (window.electronAPI) {
        const result = await window.electronAPI.saveBookProgress(book.id, progressData);
        if (result.success) {
          console.log(`添加书签成功: ${progressPercentage}%`);

          // Update local book state with new bookmarks
          setBook(prevBook => ({
            ...prevBook!,
            bookmarks: updatedBookmarks
          }));

          if (!isNaN(progressPercentage)) {
            showToast(`书签已添加: ${progressPercentage.toFixed(2)}%`);
          } else {
            showToast('书签已添加');
          }
        } else {
          console.error('添加书签失败:', result.message);
          showToast('添加书签失败');
        }
      }
    } catch (error) {
      console.error('添加书签失败:', error);
      showToast('添加书签失败');
    }
  };

            // Jump to bookmark
  const jumpToBookmark = async (bookmark: Bookmark) => {
    if (totalPages > 0) {
      setIsBookmarkJumping(true);
      let targetPage = 1;
      if (typeof bookmark.byteOffset === 'number' && pageStartByteOffsets && pageStartByteOffsets.length > 0) {
        const idx = (() => {
          for (let i = pageStartByteOffsets.length - 1; i >= 0; i--) {
            if (pageStartByteOffsets[i] <= bookmark.byteOffset!) return i;
          }
          return 0;
        })();
        targetPage = idx + 1;
        setAnchorByteOffset(bookmark.byteOffset);
      }
      setCurrentPage(targetPage);
      setShowBookmarks(false);
      const pct = typeof bookmark.byteOffset === 'number' && totalByteLength > 0
        ? Math.round((bookmark.byteOffset / Math.max(1, totalByteLength - 1)) * 10000) / 100
        : NaN;
      console.log(`跳转到书签: ${pct.toFixed(2)}% (第${targetPage}页)`);
      showToast(`已跳转到书签：${pct.toFixed(2)}%`);

      // Update reading progress after jumping to bookmark - use bookmark's progress directly
      saveReadingProgressWithProgress(NaN);
      setIsBookmarkJumping(false);
    }
  };

      // Delete bookmark
  const deleteBookmark = async (bookmarkId: string) => {
    if (!book) return;

    try {
      // Get current bookmarks and remove the specified one
      const currentBookmarks = book.bookmarks || [];
      const updatedBookmarks = currentBookmarks.filter(b => b.id !== bookmarkId);

      // Prepare progress data with updated bookmarks (byte-anchor only)
      const progressData = {
        bookId: book.id,
        anchorByteOffset: typeof anchorByteOffset === 'number' ? anchorByteOffset : (pageStartByteOffsets?.[currentPage - 1] ?? undefined),
        anchorOffset: undefined,
        totalByteLength: totalByteLength || undefined,
        contentHash: contentHash || undefined,
        lastReadAt: new Date().toISOString(),
        readingTime: Math.floor((new Date().getTime() - startTime.getTime()) / (1000 * 60)),
        bookmarks: updatedBookmarks,
        lastUpdated: new Date().toISOString()
      };

      // Save to cache file
      if (window.electronAPI) {
        const result = await window.electronAPI.saveBookProgress(book.id, progressData);
        if (result.success) {
          console.log('删除书签成功');

          // Update local book state with updated bookmarks
          setBook(prevBook => ({
            ...prevBook!,
            bookmarks: updatedBookmarks
          }));
        } else {
          console.error('删除书签失败:', result.message);
        }
      }
    } catch (error) {
      console.error('删除书签失败:', error);
    }
  };

    // Save reading progress to cache file
  const saveReadingProgress = async (targetPage?: number) => {
    if (!book) return;

    try {
      // Use targetPage if provided, otherwise use currentPage
      const pageToSave = targetPage || currentPage;
      // Progress strictly from byte offsets; percentage only derived if anchor exists
      const progressPercentage = (() => {
        if (pageStartByteOffsets && pageStartByteOffsets.length >= pageToSave && totalByteLength > 0) {
          const currentByte = pageStartByteOffsets[pageToSave - 1];
          return Math.round((currentByte / Math.max(1, totalByteLength - 1)) * 10000) / 100;
        }
        return 0;
      })();

      // Determine precise anchor offset for the first visible line on this page
      let anchor = undefined;
      let anchorByte = anchorByteOffset;
      if (pageStartByteOffsets && pageStartByteOffsets.length >= pageToSave) {
        anchorByte = pageStartByteOffsets[pageToSave - 1];
      }

      // Kindle-like location (every 128 bytes)
      const location = (() => {
        if (pageStartByteOffsets && pageStartByteOffsets.length >= pageToSave && totalByteLength > 0) {
          const currentByte = pageStartByteOffsets[pageToSave - 1];
          return Math.floor(currentByte / 128);
        }
        return undefined;
      })();

      // Prepare progress data
      const progressData = {
        bookId: book.id,
        // 仅保留字节锚点方案
        anchorOffset: typeof anchor === 'number' ? anchor : undefined,
        anchorByteOffset: typeof anchorByte === 'number' ? anchorByte : undefined,
        totalByteLength: totalByteLength || undefined,
        contentHash: contentHash || undefined,
        lastReadAt: new Date().toISOString(),
        readingTime: Math.floor((new Date().getTime() - startTime.getTime()) / (1000 * 60)),
        bookmarks: book.bookmarks || [],
        lastUpdated: new Date().toISOString(),
        location: typeof location === 'number' ? location : undefined
      };

      // Save to cache file
      if (window.electronAPI) {
        const result = await window.electronAPI.saveBookProgress(book.id, progressData);
        if (result.success) {
          if (!isNaN(progressPercentage)) {
            console.log(`保存阅读进度(字节): ${progressPercentage.toFixed(2)}%`);
          } else {
            console.log('保存阅读进度(字节)');
          }
        } else {
          console.error('保存阅读进度失败:', result.message);
        }
      }
    } catch (error) {
      console.error('保存阅读进度失败:', error);
    }
  };

  // Save reading progress with specific progress percentage (for bookmark jumps)
  const saveReadingProgressWithProgress = async (_progressPercentage: number) => {
    if (!book) return;

    try {
      // Calculate target page from current byte anchor if available; fallback to percentage
      let targetPage = currentPage;
      if (pageStartByteOffsets && pageStartByteOffsets.length > 0 && typeof anchorByteOffset === 'number') {
        const idx = (() => {
          for (let i = pageStartByteOffsets.length - 1; i >= 0; i--) {
            if (pageStartByteOffsets[i] <= anchorByteOffset) return i;
          }
          return 0;
        })();
        targetPage = idx + 1;
      }

      // Determine precise anchor offset for the first visible line on this page
      let anchor = undefined;
      let anchorByte = anchorByteOffset;
      if (pageStartByteOffsets && pageStartByteOffsets.length >= targetPage) {
        anchorByte = pageStartByteOffsets[targetPage - 1];
      }

      // Prepare progress data
      const progressData = {
        bookId: book.id,
        // 百分比入参已废弃
        currentPage: targetPage,
        totalPages: totalPages,
        lastReadAt: new Date().toISOString(),
        readingTime: Math.floor((new Date().getTime() - startTime.getTime()) / (1000 * 60)),
        bookmarks: book.bookmarks || [],
        lastUpdated: new Date().toISOString(),
        anchorOffset: typeof anchor === 'number' ? anchor : undefined,
        anchorByteOffset: typeof anchorByte === 'number' ? anchorByte : undefined
      };

      // Save to cache file
      if (window.electronAPI) {
        const result = await window.electronAPI.saveBookProgress(book.id, progressData);
        if (result.success) {
          console.log('保存阅读进度(字节)');
        } else {
          console.error('保存阅读进度失败:', result.message);
        }
      }
    } catch (error) {
      console.error('保存阅读进度失败:', error);
    }
  };



  // Load reading progress immediately after content is loaded (before pagination)
  const loadReadingProgressImmediate = async (bookId: string, rawText?: string) => {
    if (isBookmarkJumping) return;

    try {
      if (window.electronAPI) {
        console.log(`开始加载书籍 ${bookId} 的阅读进度...`);
        const result = await window.electronAPI.loadBookProgress(bookId);
        console.log('进度加载结果:', result);

        if (result.success && result.data) {
          const progressData = result.data;
          const { progress, readingTime, anchorOffset: savedAnchorOffset, anchorByteOffset: savedAnchorByteOffset } = progressData;
          console.log('进度数据:', { progress, readingTime, anchorOffset: savedAnchorOffset, anchorByteOffset: savedAnchorByteOffset });

          // Update reading time immediately
          if (readingTime > 0) {
            const newStartTime = new Date();
            newStartTime.setMinutes(newStartTime.getMinutes() - readingTime);
            setStartTime(newStartTime);
          }

          // Prefer character position if available; fallback to byte offset
          if (typeof savedAnchorOffset === 'number' && savedAnchorOffset >= 0) {
            isRestoringRef.current = true;
            console.log(`预加载字符位置: ${savedAnchorOffset}，等待分页对齐`);
            showToast('已恢复到上次阅读位置');
          } else if (typeof savedAnchorByteOffset === 'number' && savedAnchorByteOffset >= 0) {
            setAnchorByteOffset(savedAnchorByteOffset);
            isRestoringRef.current = true;
            console.log(`预加载字节锚点: ${savedAnchorByteOffset}，等待分页对齐`);
            // Show toast with percent if possible
            try {
              if (rawText) {
                const enc = new TextEncoder();
                const totalBytes = enc.encode(rawText).length;
                const pct = Math.round((Math.max(0, Math.min(savedAnchorByteOffset, totalBytes - 1)) / Math.max(1, totalBytes - 1)) * 10000) / 100;
                showToast(`已恢复到上次阅读：${pct}%`);
              } else if (typeof totalByteLength === 'number' && totalByteLength > 0) {
                const pct = Math.round((Math.max(0, Math.min(savedAnchorByteOffset, totalByteLength - 1)) / Math.max(1, totalByteLength - 1)) * 10000) / 100;
                showToast(`已恢复到上次阅读：${pct}%`);
              } else {
                showToast('已恢复到上次阅读位置');
              }
            } catch {}
          } else {
            console.log('未找到有效阅读进度，从第1页开始');
          }
        } else {
          console.log('未找到阅读进度，从第1页开始');
        }
      }
    } catch (error) {
      console.error('预加载阅读进度失败:', error);
    }
  };

  // Load bookmarks from cache file (separate function to avoid infinite loop)
  const loadBookmarks = async () => {
    if (!book) return;

    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.loadBookProgress(book.id);
        if (result.success && result.data && result.data.bookmarks) {
          setBook(prevBook => ({
            ...prevBook!,
            bookmarks: result.data.bookmarks
          }));
          console.log(`加载书签: ${result.data.bookmarks.length} 个`);
        }
      }
    } catch (error) {
      console.error('加载书签失败:', error);
    }
  };

  // Save user settings to settings.json
  const saveUserSettings = async () => {
    if (!settingsFilePath) return;

    try {
      const settings: UserSettings = {
        fontSize,
        lineHeight,
        brightness,
        fontFamily,
        backgroundColor,
        paddingTop,
        paddingBottom,
        paddingLeft,
        paddingRight,
        lastUpdated: new Date().toISOString()
      };

            if (window.electronAPI) {
        const ok = await window.electronAPI.writeFile(settingsFilePath, JSON.stringify(settings, null, 2));
        if (ok) {
          console.log('用户设置已保存');
          triggerWebDAVSync();
        } else {
          console.error('用户设置写入失败');
          alert('保存用户设置失败：无法写入设置文件');
        }
      }
    } catch (error) {
      console.error('保存用户设置失败:', error);
    }
  };

  // Debounced auto-save when settings change
  useEffect(() => {
    if (!settingsFilePath) return;
    if (settingsSaveTimerRef.current) {
      clearTimeout(settingsSaveTimerRef.current);
    }
    settingsSaveTimerRef.current = setTimeout(() => {
      saveUserSettings();
    }, 500);
    return () => {
      if (settingsSaveTimerRef.current) {
        clearTimeout(settingsSaveTimerRef.current);
      }
    };
  }, [fontSize, lineHeight, brightness, fontFamily, backgroundColor, paddingTop, paddingBottom, paddingLeft, paddingRight, settingsFilePath]);

  // Load user settings from settings.json
  const loadUserSettings = async () => {
    if (!settingsFilePath) return;

    try {
      if (window.electronAPI) {
        const existingData = await window.electronAPI.readFile(settingsFilePath);
        if (existingData) {
          const settings: UserSettings = JSON.parse(existingData);

          setFontSize(settings.fontSize || 16);
          // Backward compatible: if stored lineHeight looks like a multiplier (<=3), convert to px
          const loadedLineHeight = settings.lineHeight;
          if (loadedLineHeight && loadedLineHeight <= 3) {
            const baseFont = settings.fontSize || 16;
            setLineHeight(Math.round(baseFont * loadedLineHeight));
          } else {
            setLineHeight(loadedLineHeight || 16);
          }
          setBrightness(settings.brightness || 100);
          setFontFamily(settings.fontFamily || 'system-ui, -apple-system, sans-serif');
          setBackgroundColor(settings.backgroundColor || '#f8f9fa');
          setPaddingTop(settings.paddingTop || 60);
          setPaddingBottom(settings.paddingBottom || 60);
          setPaddingLeft(settings.paddingLeft || 80);
          setPaddingRight(settings.paddingRight || 80);

          console.log('用户设置已加载');
        } else {
          // Create default settings file
          await saveUserSettings();
        }
      }
    } catch (error) {
      console.error('加载用户设置失败:', error);
      // Create default settings file
      await saveUserSettings();
    }
  };

  const paginateContent = (text: string) => {
    try {
      // Compute total byte length once (UTF-8)
      const encoder = new TextEncoder();
      setTotalByteLength(encoder.encode(text).length);

      // Calculate available reading area based on window size and padding (for estimation only)
      const readingAreaHeightRaw = windowSize.height - paddingTop - paddingBottom;
      const readingAreaWidth = windowSize.width - paddingLeft - paddingRight;

      // Estimate characters per page purely by characters (no DOM measurement, no chapter handling)
      const linesPerPage = Math.max(3, Math.floor(Math.max(0, readingAreaHeightRaw) / Math.max(1, lineHeight)));
      const approxCharWidth = Math.max(1, Math.round(fontSize * 0.6));
      const charsPerLine = Math.max(10, Math.floor(Math.max(0, readingAreaWidth) / approxCharWidth));
      const charsPerPage = Math.max(100, linesPerPage * charsPerLine);

      const newPages: string[] = [];
      const pageByteOffsets: number[] = [];
      let cumulativeByteOffset = 0;

      for (let i = 0; i < text.length; i += charsPerPage) {
        pageByteOffsets.push(cumulativeByteOffset);
        const chunk = text.slice(i, i + charsPerPage);
        newPages.push(chunk);
        cumulativeByteOffset += encoder.encode(chunk).length;
      }

      if (newPages.length === 0) {
        newPages.push(text || '暂无内容');
        pageByteOffsets.push(0);
      }

      setPages(newPages);
      setTotalPages(newPages.length);
      setTableOfContents([]);
      setPageStartByteOffsets(pageByteOffsets);

      // Initial page
      if (newPages.length > 0) {
        setCurrentPage(1);
      } else {
        setCurrentPage(1);
      }
    } catch (error) {
      console.error('Error in paginateContent:', error);
      // Fallback: treat entire content as one page
      setPages([text || '暂无内容']);
      setTotalPages(1);
      setTableOfContents([]);
      setCurrentPage(1);
    }
  };

  const loadBook = async () => {
    try {
      setLoading(true);
      // 仅字节锚点方案，无需处理百分比预加载
      const bookId = (search as any)?.bookId;
      console.log('Reading.tsx - Loading book with ID:', bookId);
      console.log('Reading.tsx - Search object:', search);

      if (!bookId) {
        console.log('Reading.tsx - No bookId provided, showing sample content');
        setContent(getSampleContent());
        setBook({
          id: 'sample',
          title: '示例书籍',
          author: '示例作者',
          fileName: 'sample.txt',
          filePath: '/sample/path',
          size: 1024,
          addedAt: new Date().toISOString()
        });
        setLoading(false);
        return;
      }

      if (window.electronAPI) {
        console.log('Reading.tsx - Fetching books from library...');
        const books = await window.electronAPI.getBooks();
        console.log('Reading.tsx - Received books:', books);

              // Ensure bookId is a string for comparison
      console.log('Reading.tsx - Looking for book with ID:', bookId);
      console.log('Reading.tsx - Available book IDs:', books.map(b => ({ id: b.id, title: b.title })));

      const selectedBook = books.find(b => {
        const match = String(b.id) === String(bookId);
        console.log(`Reading.tsx - Comparing book ID: "${b.id}" (${typeof b.id}) with "${bookId}" (${typeof bookId}) = ${match}`);
        return match;
      });

        if (selectedBook) {
          console.log('Reading.tsx - Found selected book:', selectedBook);
          setBook(selectedBook);
          try {
            const bookContent = await window.electronAPI.readBookContent(selectedBook.filePath);
            setContent(bookContent.content);
            await computeContentHash(bookContent.content);

            // Show encoding info in console for debugging
            if (bookContent.encoding) {
              console.log(`文件编码: ${bookContent.encoding}`);
            }

            // Show EPUB metadata if available
            if (bookContent.type === 'epub' && bookContent.metadata) {
              console.log('EPUB metadata:', bookContent.metadata);
            }

                        if (bookContent.type === 'epub' && bookContent.toc) {
              console.log('EPUB table of contents:', bookContent.toc);
            }

            // Load reading progress immediately after content is set
            await loadReadingProgressImmediate(selectedBook.id, bookContent.content);
          } catch (readError) {
            console.error('读取书籍内容失败:', readError);
            const errorMessage = readError instanceof Error ? readError.message : String(readError);
            setContent(`读取书籍内容时出错: ${errorMessage}\n\n请确保文件存在且没有被其他程序占用。`);
          }
        } else {
          console.log('Reading.tsx - Book not found, showing error content');
          // Book not found - show error message
          setContent(`找不到ID为 "${bookId}" 的书籍。\n\n请返回书架重新选择书籍。`);
          setBook({
            id: String(bookId),
            title: '书籍未找到',
            author: '未知',
            fileName: 'unknown.txt',
            filePath: '/unknown/path',
            size: 0,
            addedAt: new Date().toISOString()
          });
        }
      } else {
        console.log('Reading.tsx - No electronAPI available, showing sample content');
        setContent(getSampleContent());
        setBook({
          id: 'sample',
          title: '示例书籍',
          author: '示例作者',
          fileName: 'sample.txt',
          filePath: '/sample/path',
          size: 1024,
          addedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Reading.tsx - Error loading book:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setContent(`加载书籍时出错: ${errorMessage}\n\n请刷新页面重试。`);
    } finally {
      setLoading(false);
    }
  };

  const getSampleContent = () => `欢迎使用电子书阅读器！

这是一个简洁而强大的阅读工具，支持多种文件格式。

功能特点：
• 支持 TXT、PDF、EPUB、MOBI 等格式
• 自动检测文件编码
• 可调节字体大小
• 支持键盘和鼠标翻页
• 自动生成目录

请从书架选择您要阅读的书籍开始使用。`;


  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      position: 'relative',
      backgroundColor: backgroundColor,
      filter: `brightness(${brightness}%)`,
      overflow: 'hidden'
    }}>
      {loading ? (
        <div style={{
          height: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          color: '#666',
          fontSize: '18px'
        }}>
          正在加载书籍内容...
        </div>
      ) : (
        <>
          {/* Main reading area */}
          <div
            style={{
              height: '100vh',
              display: 'flex',
              flexDirection: 'column',
              padding: `${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px`,
              position: 'relative',
              overflow: 'hidden'
            }}
            onClick={() => {
              // If toolbar is visible, clicking anywhere hides it
              if (showToolbar) {
                setShowToolbar(false);
                return;
              }

              // Middle area - show toolbar
              setShowToolbar(true);
              setShowTableOfContents(false);
            }}
          >
            <div style={{
              width: '100%',
              // Snap height to an integer number of lines to avoid half-clipped last line
              height: `${Math.max(lineHeight, Math.floor(Math.max(0, (windowSize.height - paddingTop - paddingBottom)) / Math.max(1, lineHeight)) * Math.max(1, lineHeight))}px`,
              fontSize: `${fontSize}px`,
              lineHeight: `${lineHeight}px`,
              fontFamily: fontFamily,
              color: '#333',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              textAlign: 'left',
              overflow: 'hidden',
              boxSizing: 'border-box'
            }}>
              {pages.length > 0 ? (pages[currentPage - 1] || '暂无内容') : '正在处理内容...'}
            </div>

            {/* Left navigation button */}
            <button
              onClick={async (e) => {
                e.stopPropagation();
                const target = Math.max(1, currentPage - 1);
                setCurrentPage(target);
                setShowTableOfContents(false);
                // Save reading progress after page change
                saveReadingProgress(target);
              }}
              style={{
                position: 'absolute',
                left: '20px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '60px',
                height: '120px',
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                border: 'none',
                borderRadius: '30px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                color: 'rgba(0, 0, 0, 0.6)',
                transition: 'all 0.2s ease',
                zIndex: 50
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
                e.currentTarget.style.color = 'rgba(0, 0, 0, 0.8)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
                e.currentTarget.style.color = 'rgba(0, 0, 0, 0.6)';
              }}
              title="上一页"
            >
              ←
            </button>

            {/* Right navigation button */}
            <button
              onClick={async (e) => {
                e.stopPropagation();
                const target = Math.min(totalPages, currentPage + 1);
                setCurrentPage(target);
                setShowTableOfContents(false);
                // Save reading progress after page change
                saveReadingProgress(target);
              }}
              style={{
                position: 'absolute',
                right: '20px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '60px',
                height: '120px',
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                border: 'none',
                borderRadius: '30px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                color: 'rgba(0, 0, 0, 0.6)',
                transition: 'all 0.2s ease',
                zIndex: 50
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
                e.currentTarget.style.color = 'rgba(0, 0, 0, 0.8)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
                e.currentTarget.style.color = 'rgba(0, 0, 0, 0.6)';
              }}
              title="下一页"
            >
              →
            </button>
          </div>

          {/* Restore/align toast */}
          {toastMessage && (
            <div
              style={{
                position: 'fixed',
                bottom: '90px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: 'rgba(0,0,0,0.75)',
                color: 'white',
                padding: '10px 14px',
                borderRadius: '12px',
                fontSize: '12px',
                zIndex: 2000,
                pointerEvents: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
              }}
            >
              {toastMessage}
            </div>
          )}


                    {/* Floating toolbar - only show when showToolbar is true */}
          {showToolbar && (
            <>
              {/* Top toolbar - Book title and return button */}
              <div style={{
                position: 'fixed',
                top: '0',
                left: '0',
                right: '0',
                zIndex: 100,
                backgroundColor: '#4a90e2',
                padding: '60px 20px 20px 20px',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%'
                }}>
                  <Link to="/" style={{
                    width: '40px',
                    height: '40px',
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    borderRadius: '50%',
                    textDecoration: 'none',
                    color: 'white',
                    fontSize: '18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                  }}>
                    ←
                  </Link>

                  <div style={{
                    flex: 1,
                    textAlign: 'center',
                    color: 'white',
                    fontSize: '16px',
                    fontWeight: '500',
                    margin: '0 20px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {book?.title || '未知书籍'}
                    {book?.author && ` 作者:${book.author}`}
                  </div>

                  <button
                    onClick={addBookmark}
                    style={{
                      width: '40px',
                      height: '40px',
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      borderRadius: '50%',
                      border: 'none',
                      color: 'white',
                      fontSize: '18px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    title="添加书签"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                    }}
                  >
                    ⚐
                  </button>
                </div>
              </div>

                            {/* Bottom toolbar - Progress and controls */}
              <div style={{
                position: 'fixed',
                bottom: '0',
                left: '0',
                right: '0',
                zIndex: 100,
                backgroundColor: '#4a90e2',
                padding: '20px',
                boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.1)'
              }}>
                <div style={{
                  width: '100%'
                }}>
                  {/* Progress bar section */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '20px'
                  }}>
                    <div style={{
                      flex: 1,
                      marginRight: '20px'
                    }}>
                      <div
                        ref={progressBarRef}
                        style={{
                          width: '100%',
                          height: '6px',
                          backgroundColor: 'rgba(255, 255, 255, 0.3)',
                          borderRadius: '3px',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          position: 'relative'
                        }}
                        onMouseDown={handleProgressBarMouseDown}
                      >
                        <div style={{
                          width: `${Math.round(((currentPage - 1) / Math.max(1, totalPages - 1)) * 100)}%`,
                          height: '100%',
                          backgroundColor: 'white',
                          borderRadius: '3px',
                          transition: 'width 0.3s ease',
                          position: 'relative'
                        }}>
                          <div style={{
                            position: 'absolute',
                            right: '-6px',
                            top: '-3px',
                            width: '12px',
                            height: '12px',
                            backgroundColor: 'white',
                            borderRadius: '50%',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
                          }} />
                        </div>
                      </div>
                    </div>

                    <div style={{
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: '500',
                      whiteSpace: 'nowrap'
                    }}>
                      {Math.round(((currentPage - 1) / Math.max(1, totalPages - 1)) * 100)}% →
                    </div>
                  </div>

                  {/* Control icons row */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-around'
                  }}>
                    {/* Table of contents */}
                    <button
                      onClick={() => setShowTableOfContents(true)}
                      style={{
                        width: '44px',
                        height: '44px',
                        backgroundColor: 'rgba(255, 255, 255, 0.2)',
                        border: 'none',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        fontSize: '18px',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        transition: 'all 0.2s ease'
                      }}
                      title="目录"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                      }}
                    >
                      ≡
                    </button>

                    {/* Bookmark */}
                    <button
                      onClick={() => handleBookmark()}
                      style={{
                        width: '44px',
                        height: '44px',
                        backgroundColor: 'rgba(255, 255, 255, 0.2)',
                        border: 'none',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        fontSize: '18px',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        transition: 'all 0.2s ease'
                      }}
                      title="书签"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                      }}
                    >
                      ⚷
                    </button>

                    {/* Color and brightness */}
                    <button
                      onClick={() => setShowColorSettings(true)}
                      style={{
                        width: '44px',
                        height: '44px',
                        backgroundColor: 'rgba(255, 255, 255, 0.2)',
                        border: 'none',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        fontSize: '18px',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        transition: 'all 0.2s ease'
                      }}
                      title="颜色和亮度"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                      }}
                    >
                      ⚙
                    </button>

                    {/* Font and layout settings */}
                    <button
                      onClick={() => setShowFontSettings(true)}
                      style={{
                        width: '44px',
                        height: '44px',
                        backgroundColor: 'rgba(255, 255, 255, 0.2)',
                        border: 'none',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        fontSize: '18px',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        transition: 'all 0.2s ease'
                      }}
                      title="字体和布局"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                      }}
                    >
                      A
                    </button>
                  </div>
                </div>
              </div>


            </>
          )}

          {/* Color Settings Panel */}
          {showColorSettings && (
            <>
              {/* Overlay */}
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  zIndex: 200
                }}
                onClick={() => setShowColorSettings(false)}
              />

              {/* Color Settings Panel */}
              <div style={{
                position: 'fixed',
                bottom: '120px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: 'white',
                borderRadius: '20px',
                padding: '25px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                zIndex: 300,
                minWidth: '300px'
              }}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', color: '#333', textAlign: 'center' }}>
                  颜色和亮度设置
                </h3>

                {/* Brightness Control */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>亮度</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '12px', color: '#999' }}>暗</span>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={brightness}
                      onChange={(e) => {
                        setBrightness(Number(e.target.value));
                        saveUserSettings();
                      }}
                      style={{ flex: 1, height: '6px', borderRadius: '3px' }}
                    />
                    <span style={{ fontSize: '12px', color: '#999' }}>亮</span>
                  </div>
                </div>

                {/* Color Themes */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>颜色主题</div>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    {[
                      { color: '#ffffff', name: '白色' },
                      { color: '#f8f9fa', name: '浅灰' },
                      { color: '#e8f5e8', name: '浅绿' },
                      { color: '#e3f2fd', name: '浅蓝' }
                    ].map((theme) => (
                      <button
                        key={theme.color}
                        onClick={() => {
                          setBackgroundColor(theme.color);
                          saveUserSettings();
                        }}
                        style={{
                          width: '40px',
                          height: '40px',
                          backgroundColor: theme.color,
                          border: backgroundColor === theme.color ? '3px solid #4a90e2' : '1px solid #ddd',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          position: 'relative',
                          boxShadow: backgroundColor === theme.color ? '0 0 0 2px rgba(74, 144, 226, 0.3)' : 'none'
                        }}
                        title={theme.name}
                      />
                    ))}
                  </div>
                </div>


              </div>
            </>
          )}

          {/* Font Settings Panel */}
          {showFontSettings && (
            <>
              {/* Overlay */}
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  zIndex: 200
                }}
                onClick={() => setShowFontSettings(false)}
              />

              {/* Font Settings Panel */}
              <div style={{
                position: 'fixed',
                bottom: '120px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: 'white',
                borderRadius: '20px',
                padding: '25px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                zIndex: 300,
                minWidth: '300px'
              }}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', color: '#333', textAlign: 'center' }}>
                  字体和布局设置
                </h3>

                {/* Font Size Control */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>字体大小</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', justifyContent: 'center' }}>
                    <button
                      onClick={() => {
                        setFontSize(Math.max(12, fontSize - 2));
                        saveUserSettings();
                      }}
                      style={{
                        width: '40px',
                        height: '40px',
                        backgroundColor: '#f0f0f0',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '16px',
                        fontWeight: 'bold'
                      }}
                    >
                      A-
                    </button>
                    <span style={{
                      padding: '8px 16px',
                      backgroundColor: '#4a90e2',
                      color: 'white',
                      borderRadius: '20px',
                      fontSize: '14px',
                      fontWeight: '500',
                      minWidth: '60px',
                      textAlign: 'center'
                    }}>
                      {fontSize}px
                    </span>
                    <button
                      onClick={() => {
                        setFontSize(Math.min(24, fontSize + 2));
                        saveUserSettings();
                      }}
                      style={{
                        width: '40px',
                        height: '40px',
                        backgroundColor: '#f0f0f0',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '16px',
                        fontWeight: 'bold'
                      }}
                    >
                      A+
                    </button>
                  </div>
                </div>

                {/* Line Height Control (pixel-based) */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>行距（像素）</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '12px', color: '#999' }}>紧</span>
                    <input
                      type="range"
                      min="16"
                      max="60"
                      step="1"
                      value={lineHeight}
                      onChange={(e) => {
                        setLineHeight(Number(e.target.value));
                        saveUserSettings();
                      }}
                      style={{ flex: 1, height: '6px', borderRadius: '3px' }}
                    />
                    <span style={{ fontSize: '12px', color: '#999' }}>松</span>
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '12px', color: '#999', marginTop: '5px' }}>
                    {lineHeight}px
                  </div>
                </div>

                {/* Font Family Control */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>字体</div>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {[
                      { family: 'system-ui, -apple-system, sans-serif', name: '系统字体' },
                      { family: 'Georgia, serif', name: '衬线字体' },
                      { family: 'Monaco, Consolas, monospace', name: '等宽字体' }
                    ].map((font) => (
                      <button
                        key={font.family}
                        onClick={() => {
                          setFontFamily(font.family);
                          saveUserSettings();
                        }}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: fontFamily === font.family ? '#4a90e2' : '#f0f0f0',
                          color: fontFamily === font.family ? 'white' : '#333',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          transition: 'all 0.2s ease'
                        }}
                        title={font.name}
                      >
                        {font.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Padding Controls */}
                <div>
                  <div style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>边距设置</div>

                  {/* Top and Bottom Padding */}
                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ fontSize: '12px', color: '#999', marginBottom: '8px' }}>上下边距</div>
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '11px', color: '#999', marginBottom: '5px' }}>上边距</div>
                        <input
                          type="range"
                          min="20"
                          max="120"
                          step="10"
                          value={paddingTop}
                          onChange={(e) => {
                            setPaddingTop(Number(e.target.value));
                            saveUserSettings();
                            // Trigger repagination immediately
                            if (content) {
                              paginateContent(content);
                            }
                          }}
                          style={{ width: '100%', height: '6px', borderRadius: '3px' }}
                        />
                        <div style={{ textAlign: 'center', fontSize: '10px', color: '#999', marginTop: '3px' }}>
                          {paddingTop}px
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '11px', color: '#999', marginBottom: '5px' }}>下边距</div>
                        <input
                          type="range"
                          min="20"
                          max="120"
                          step="10"
                          value={paddingBottom}
                          onChange={(e) => {
                            setPaddingBottom(Number(e.target.value));
                            saveUserSettings();
                            // Trigger repagination immediately
                            if (content) {
                              paginateContent(content);
                            }
                          }}
                          style={{ width: '100%', height: '6px', borderRadius: '3px' }}
                        />
                        <div style={{ textAlign: 'center', fontSize: '10px', color: '#999', marginTop: '3px' }}>
                          {paddingBottom}px
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Left and Right Padding */}
                  <div>
                    <div style={{ fontSize: '12px', color: '#999', marginBottom: '8px' }}>左右边距</div>
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '11px', color: '#999', marginBottom: '5px' }}>左边距</div>
                        <input
                          type="range"
                          min="40"
                          max="200"
                          step="10"
                          value={paddingLeft}
                          onChange={(e) => {
                            setPaddingLeft(Number(e.target.value));
                            saveUserSettings();
                            // Trigger repagination immediately
                            if (content) {
                              paginateContent(content);
                            }
                          }}
                          style={{ width: '100%', height: '6px', borderRadius: '3px' }}
                        />
                        <div style={{ textAlign: 'center', fontSize: '10px', color: '#999', marginTop: '3px' }}>
                          {paddingLeft}px
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '11px', color: '#999', marginBottom: '5px' }}>右边距</div>
                        <input
                          type="range"
                          min="40"
                          max="200"
                          step="10"
                          value={paddingRight}
                          onChange={(e) => {
                            setPaddingRight(Number(e.target.value));
                            saveUserSettings();
                            // Trigger repagination immediately
                            if (content) {
                              paginateContent(content);
                            }
                          }}
                          style={{ width: '100%', height: '6px', borderRadius: '3px' }}
                        />
                        <div style={{ textAlign: 'center', fontSize: '10px', color: '#999', marginTop: '3px' }}>
                          {paddingRight}px
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Bookmarks Panel */}
          {showBookmarks && (
            <>
              {/* Overlay */}
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  zIndex: 200
                }}
                onClick={() => setShowBookmarks(false)}
              />

              {/* Bookmarks Panel */}
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '400px',
                height: '100vh',
                backgroundColor: 'white',
                boxShadow: '2px 0 10px rgba(0, 0, 0, 0.1)',
                zIndex: 300,
                display: 'flex',
                flexDirection: 'column'
              }}>
                {/* Header */}
                <div style={{
                  padding: '20px',
                  borderBottom: '1px solid #eee',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <h3 style={{ margin: 0, fontSize: '18px', color: '#333' }}>书签列表</h3>
                  <button
                    onClick={() => setShowBookmarks(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '20px',
                      cursor: 'pointer',
                      color: '#666'
                    }}
                  >
                    ×
                  </button>
                </div>

                {/* Book info */}
                <div style={{
                  padding: '15px 20px',
                  borderBottom: '1px solid #eee',
                  fontSize: '14px',
                  color: '#666'
                }}>
                  {book ? `${book.title} - ${book.author || '未知作者'}` : '当前书籍'}
                </div>

                {/* Bookmarks content */}
                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '10px 0'
                }}>
                  {book?.bookmarks && book.bookmarks.length > 0 ? (
                    book.bookmarks.map((bookmark) => (
                      <div
                        key={bookmark.id}
                        style={{
                          padding: '15px 20px',
                          cursor: 'pointer',
                          borderBottom: '1px solid #f5f5f5',
                          backgroundColor: 'transparent',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f0f7ff';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        onClick={() => jumpToBookmark(bookmark)}
                      >
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '8px'
                        }}>
                          <div style={{ fontSize: '14px', color: '#333', fontWeight: '500' }}>
                            {bookmark.description}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteBookmark(bookmark.id);
                            }}
                            style={{
                              padding: '4px 8px',
                              backgroundColor: '#ff6b6b',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '10px',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#e55555';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#ff6b6b';
                            }}
                          >
                            删除
                          </button>
                        </div>
                        <div style={{
                          fontSize: '12px',
                          color: '#999',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}>
                          <span>{(() => {
                            if (typeof bookmark.byteOffset === 'number' && totalByteLength > 0) {
                              const pct = Math.round((bookmark.byteOffset / Math.max(1, totalByteLength - 1)) * 10000) / 100;
                              return `${pct.toFixed(2)}%`;
                            }
                            return '—';
                          })()}</span>
                          <span>{new Date(bookmark.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{
                      padding: '40px 20px',
                      textAlign: 'center',
                      color: '#999',
                      fontSize: '14px'
                    }}>
                      暂无书签
                      <div style={{ fontSize: '12px', marginTop: '8px' }}>
                        点击右上角书签按钮添加书签
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Table of Contents Sidebar */}
          {showTableOfContents && (
            <>
              {/* Overlay */}
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  zIndex: 200
                }}
                onClick={() => setShowTableOfContents(false)}
              />

              {/* Sidebar */}
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '400px',
                height: '100vh',
                backgroundColor: 'white',
                boxShadow: '2px 0 10px rgba(0, 0, 0, 0.1)',
                zIndex: 300,
                display: 'flex',
                flexDirection: 'column'
              }}>
                {/* Header */}
                <div style={{
                  padding: '20px',
                  borderBottom: '1px solid #eee',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <h3 style={{ margin: 0, fontSize: '18px', color: '#333' }}>目录</h3>
                  <button
                    onClick={() => setShowTableOfContents(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '20px',
                      cursor: 'pointer',
                      color: '#666'
                    }}
                  >
                    ×
                  </button>
                </div>

                {/* Book info */}
                <div style={{
                  padding: '15px 20px',
                  borderBottom: '1px solid #eee',
                  fontSize: '14px',
                  color: '#666'
                }}>
                  {book ? `${book.title} - ${book.author || '未知作者'}` : '当前书籍'}
                </div>

                {/* TOC content */}
                <div
                  ref={(el) => {
                    // Auto scroll to current chapter when TOC opens
                    if (el && showTableOfContents && tableOfContents.length > 0) {
                      setTimeout(() => {
                        const currentChapterIndex = tableOfContents.findIndex((item, index) => {
                          // Calculate current reading progress percentage
                          const currentProgress = totalPages > 0 ? Math.round(((currentPage - 1) / totalPages) * 100) : 0;

                          // Calculate this chapter's progress percentage
                          const chapterProgress = totalPages > 0 ? Math.round(((item.page - 1) / totalPages) * 100) : 0;

                          const nextChapter = tableOfContents[index + 1];
                          if (nextChapter) {
                            // Calculate next chapter's progress percentage
                            const nextChapterProgress = totalPages > 0 ? Math.round(((nextChapter.page - 1) / totalPages) * 100) : 0;
                            return currentProgress >= chapterProgress && currentProgress < nextChapterProgress;
                          } else {
                            return currentProgress >= chapterProgress;
                          }
                        });

                        if (currentChapterIndex >= 0) {
                          const chapterElement = el.children[currentChapterIndex] as HTMLElement;
                          if (chapterElement) {
                            chapterElement.scrollIntoView({
                              behavior: 'smooth',
                              block: 'center'
                            });
                          }
                        }
                      }, 100);
                    }
                  }}
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '10px 0'
                  }}
                >
                  {tableOfContents.length > 0 ? (
                    tableOfContents.map((item, index) => {
                      // Find the current chapter based on reading progress percentage
                      const isCurrentChapter = (() => {
                        // Calculate current reading progress percentage
                        const currentProgress = totalPages > 0 ? Math.round(((currentPage - 1) / totalPages) * 100) : 0;

                        // Calculate this chapter's progress percentage
                        const chapterProgress = totalPages > 0 ? Math.round(((item.page - 1) / totalPages) * 100) : 0;

                        // Find the next chapter
                        const nextChapter = tableOfContents[index + 1];
                        if (nextChapter) {
                          // Calculate next chapter's progress percentage
                          const nextChapterProgress = totalPages > 0 ? Math.round(((nextChapter.page - 1) / totalPages) * 100) : 0;
                          // If current progress is between this chapter and the next
                          return currentProgress >= chapterProgress && currentProgress < nextChapterProgress;
                        } else {
                          // If this is the last chapter and current progress is at or after it
                          return currentProgress >= chapterProgress;
                        }
                      })();

                      return (
                        <div
                          key={index}
                          style={{
                            padding: '10px 20px',
                            cursor: 'pointer',
                            borderBottom: '1px solid #f5f5f5',
                            backgroundColor: isCurrentChapter ? '#f0f7ff' : 'transparent',
                            color: isCurrentChapter ? '#4a90e2' : '#333',
                            borderLeft: isCurrentChapter ? '4px solid #4a90e2' : '4px solid transparent',
                            transition: 'all 0.2s ease'
                          }}
                        onClick={() => {
                          // With fixed-char pagination and byte-only anchors, jump by stored page
                          const targetPage = Math.max(1, Math.min(totalPages, item.page));
                          setCurrentPage(targetPage);
                          setShowTableOfContents(false);
                          saveReadingProgress(targetPage);
                        }}
                      >
                        <div style={{ fontSize: '14px', marginBottom: '4px' }}>
                          {item.title}
                        </div>
                        <div style={{
                          fontSize: '12px',
                          color: isCurrentChapter ? '#4a90e2' : '#999',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}>
                          <span>
                            {(() => {
                              const chapterProgress = totalPages > 0 ? Math.round(((item.page - 1) / totalPages) * 100) : 0;
                              return `${chapterProgress}%`;
                            })()}
                          </span>
                          {isCurrentChapter && (
                            <span style={{
                              fontSize: '10px',
                              backgroundColor: '#4a90e2',
                              color: 'white',
                              padding: '2px 6px',
                              borderRadius: '10px'
                            }}>
                              正在阅读
                            </span>
                          )}
                        </div>
                      </div>
                      );
                    })
                  ) : (
                    <div style={{
                      padding: '40px 20px',
                      textAlign: 'center',
                      color: '#999',
                      fontSize: '14px'
                    }}>
                      暂无目录信息
                      <div style={{ fontSize: '12px', marginTop: '8px' }}>
                        系统会自动识别以"第...章"开头的标题
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default Reading;
