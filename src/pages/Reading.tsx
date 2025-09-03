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
    progress: number; // 0-100 percentage
    lastReadAt: string;
    readingTime: number; // in minutes
  };
  bookmarks?: Bookmark[];
}

interface Bookmark {
  id: string;
  progress: number; // 0-100 percentage
  description: string;
  createdAt: string;
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
  const [pageStartOffsets, setPageStartOffsets] = useState<number[]>([]);
  const [pageStartByteOffsets, setPageStartByteOffsets] = useState<number[]>([]);
  const [anchorOffset, setAnchorOffset] = useState<number | null>(null);
  const [anchorByteOffset, setAnchorByteOffset] = useState<number | null>(null);
  const [totalByteLength, setTotalByteLength] = useState<number>(0);
  const [contentHash, setContentHash] = useState<string>('');
  const lastAlignSignatureRef = useRef<string>('');
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
  const [readingProgress, setReadingProgress] = useState(0);
  const [preloadedProgress, setPreloadedProgress] = useState<number | null>(null);
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
        // Capture both byte and char anchors of current first visible line
        if (pageStartOffsets && pageStartOffsets.length >= currentPage) {
          setAnchorOffset(pageStartOffsets[currentPage - 1]);
        }
        if (pageStartByteOffsets && pageStartByteOffsets.length >= currentPage) {
          setAnchorByteOffset(pageStartByteOffsets[currentPage - 1]);
        }
        setWindowSize({ width: window.innerWidth, height: window.innerHeight });
        // end of resize
        resizeInProgressRef.current = false;
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
        const denom = Math.max(1, totalByteLength - 1);
        setReadingProgress(Math.min(1, Math.max(0, currentByte / denom)));
        setAnchorByteOffset(currentByte);
      }

      // Keep character anchors as secondary
      if (pageStartOffsets && pageStartOffsets.length >= currentPage) {
        setAnchorOffset(pageStartOffsets[currentPage - 1]);
      }
    }
  }, [currentPage, totalPages, pageStartByteOffsets, totalByteLength]);

  // Align page after pagination when anchor arrives later than content (skip while resizing)
  useEffect(() => {
    if (resizeInProgressRef.current) return;
    // Build an alignment signature to prevent repeated setCurrentPage loops
    const sig = JSON.stringify({
      a: anchorByteOffset ?? anchorOffset ?? -1,
      p: pageStartByteOffsets.length || pageStartOffsets.length,
      t: totalPages
    });
    if (lastAlignSignatureRef.current === sig) return;

    // Prefer byte anchor
    if (anchorByteOffset !== null && pageStartByteOffsets.length > 0 && totalPages > 0) {
      const idx = (() => {
        for (let i = pageStartByteOffsets.length - 1; i >= 0; i--) {
          if (pageStartByteOffsets[i] <= anchorByteOffset) return i;
        }
        return 0;
      })();
      const target = Math.max(1, Math.min(totalPages, idx + 1));
      if (target !== currentPage) {
        setCurrentPage(target);
      }
      // Once we align from a restore, clear restoring flag to avoid later re-alignments overriding user nav
      if (isRestoringRef.current) isRestoringRef.current = false;
      lastAlignSignatureRef.current = sig;
      return;
    }
    // Fallback to character anchor
    if (anchorOffset !== null && pageStartOffsets.length > 0 && totalPages > 0) {
      const idx = (() => {
        for (let i = pageStartOffsets.length - 1; i >= 0; i--) {
          if (pageStartOffsets[i] <= anchorOffset) return i;
        }
        return 0;
      })();
      const target = Math.max(1, Math.min(totalPages, idx + 1));
      if (target !== currentPage) {
        setCurrentPage(target);
      }
      if (isRestoringRef.current) isRestoringRef.current = false;
      lastAlignSignatureRef.current = sig;
    }
  }, [anchorByteOffset, pageStartByteOffsets, anchorOffset, pageStartOffsets, totalPages]);

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

  // Apply preloaded progress after pagination is complete
  useEffect(() => {
    console.log('进度应用useEffect触发:', { preloadedProgress, totalPages, currentPage });

    if (preloadedProgress !== null && preloadedProgress > 0 && totalPages > 1) {
      const targetPage = Math.max(1, Math.min(totalPages, Math.round(preloadedProgress * totalPages) + 1));
      console.log(`计算目标页面: 进度=${(preloadedProgress * 100).toFixed(2)}%, 总页数=${totalPages}, 目标页=${targetPage}`);
      setCurrentPage(targetPage);
      console.log(`分页完成后应用预加载进度: ${(preloadedProgress * 100).toFixed(2)}%，跳转到第 ${targetPage} 页`);
      // Clear preloaded progress after application
      setPreloadedProgress(null);
    } else {
      console.log('不满足进度应用条件:', {
        hasPreloadedProgress: preloadedProgress !== null,
        progressValue: preloadedProgress,
        totalPages,
        condition: preloadedProgress !== null && preloadedProgress > 0 && totalPages > 1
      });
    }
  }, [totalPages, preloadedProgress]);

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
  }, [totalPages]);

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
      // Save reading progress after drag operation
      saveReadingProgress();
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
    saveReadingProgress();
  };

  // Handle bookmark functionality
  const handleBookmark = () => {
    setShowBookmarks(true);
  };

  // Add bookmark function
  const addBookmark = async () => {
    if (!book) return;

    try {
      // Create new bookmark
      const progressPercentage = totalPages > 0 ? Math.round(((currentPage - 1) / totalPages) * 10000) / 100 : 0;
      const newBookmark: Bookmark = {
        id: Date.now().toString(),
        progress: progressPercentage,
        description: `${progressPercentage.toFixed(2)}%`,
        createdAt: new Date().toISOString()
      };

      // Get current bookmarks
      const currentBookmarks = book.bookmarks || [];
      const updatedBookmarks = [...currentBookmarks, newBookmark];

      // Prepare progress data with updated bookmarks
      const progressData = {
        bookId: book.id,
        progress: progressPercentage,
        currentPage: currentPage,
        totalPages: totalPages,
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

          alert(`书签已添加: ${progressPercentage.toFixed(2)}%`);
        } else {
          console.error('添加书签失败:', result.message);
          alert('添加书签失败');
        }
      }
    } catch (error) {
      console.error('添加书签失败:', error);
      alert('添加书签失败');
    }
  };

            // Jump to bookmark
  const jumpToBookmark = async (bookmark: Bookmark) => {
    if (totalPages > 0) {
      setIsBookmarkJumping(true);
      const targetPage = Math.max(1, Math.min(totalPages, Math.round((bookmark.progress / 100) * totalPages) + 1));
      setCurrentPage(targetPage);
      setShowBookmarks(false);
      console.log(`跳转到书签: ${bookmark.progress.toFixed(2)}% (第${targetPage}页)`);

      // Update reading progress after jumping to bookmark - use bookmark's progress directly
      saveReadingProgressWithProgress(bookmark.progress);  // 直接使用书签的进度百分比
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

      // Get current progress data
      const progressPercentage = totalPages > 0 ? Math.round(((currentPage - 1) / totalPages) * 10000) / 100 : 0;

      // Prepare progress data with updated bookmarks
      const progressData = {
        bookId: book.id,
        progress: progressPercentage,
        currentPage: currentPage,
        totalPages: totalPages,
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
      // Progress now based on byte offsets rather than page/percentage; retain percentage for UI only
      const progressPercentage = (() => {
        if (pageStartByteOffsets && pageStartByteOffsets.length >= pageToSave && totalByteLength > 0) {
          const currentByte = pageStartByteOffsets[pageToSave - 1];
          return Math.round((currentByte / Math.max(1, totalByteLength - 1)) * 10000) / 100;
        }
        return totalPages > 0 ? Math.round(((pageToSave - 1) / totalPages) * 10000) / 100 : 0;
      })();

      // Determine precise anchor offset for the first visible line on this page
      let anchor = anchorOffset;
      let anchorByte = anchorByteOffset;
      if (pageStartOffsets && pageStartOffsets.length >= pageToSave) {
        anchor = pageStartOffsets[pageToSave - 1];
      }
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
        progress: progressPercentage,
        currentPage: pageToSave,
        totalPages: totalPages,
        lastReadAt: new Date().toISOString(),
        readingTime: Math.floor((new Date().getTime() - startTime.getTime()) / (1000 * 60)),
        bookmarks: book.bookmarks || [],
        lastUpdated: new Date().toISOString(),
        anchorOffset: typeof anchor === 'number' ? anchor : undefined,
        anchorByteOffset: typeof anchorByte === 'number' ? anchorByte : undefined,
        totalByteLength: totalByteLength || undefined,
        contentHash: contentHash || undefined,
        location: typeof location === 'number' ? location : undefined
      };

      // Save to cache file
      if (window.electronAPI) {
        const result = await window.electronAPI.saveBookProgress(book.id, progressData);
        if (result.success) {
          console.log(`保存阅读进度: ${progressPercentage.toFixed(2)}%`);
        } else {
          console.error('保存阅读进度失败:', result.message);
        }
      }
    } catch (error) {
      console.error('保存阅读进度失败:', error);
    }
  };

  // Save reading progress with specific progress percentage (for bookmark jumps)
  const saveReadingProgressWithProgress = async (progressPercentage: number) => {
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
      } else {
        targetPage = Math.max(1, Math.min(totalPages, Math.round((progressPercentage / 100) * totalPages) + 1));
      }

      // Determine precise anchor offset for the first visible line on this page
      let anchor = anchorOffset;
      let anchorByte = anchorByteOffset;
      if (pageStartOffsets && pageStartOffsets.length >= targetPage) {
        anchor = pageStartOffsets[targetPage - 1];
      }
      if (pageStartByteOffsets && pageStartByteOffsets.length >= targetPage) {
        anchorByte = pageStartByteOffsets[targetPage - 1];
      }

      // Prepare progress data
      const progressData = {
        bookId: book.id,
        progress: progressPercentage,
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
          console.log(`保存阅读进度: ${progressPercentage.toFixed(2)}%`);
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

          // Prefer precise anchor offset if available; fallback to percentage
          if (typeof savedAnchorByteOffset === 'number' && savedAnchorByteOffset >= 0) {
            setAnchorByteOffset(savedAnchorByteOffset);
            isRestoringRef.current = true;
            console.log(`预加载字节锚点: ${savedAnchorByteOffset}，等待分页对齐`);
          } else if (typeof savedAnchorOffset === 'number' && savedAnchorOffset >= 0) {
            setAnchorOffset(savedAnchorOffset);
            isRestoringRef.current = true;
            console.log(`预加载锚点偏移: ${savedAnchorOffset}，等待分页对齐`);
          } else if (progress > 0) {
            // Convert percent to byte anchor using provided rawText if available
            if (rawText) {
              try {
                const encoder = new TextEncoder();
                const totalBytes = encoder.encode(rawText).length;
                const byteAnchor = Math.max(0, Math.min(totalBytes - 1, Math.round((progress / 100) * (Math.max(1, totalBytes - 1)))));
                setAnchorByteOffset(byteAnchor);
                isRestoringRef.current = true;
                console.log(`由百分比推算字节锚点: ${byteAnchor}/${totalBytes}`);
              } catch (e) {
                setPreloadedProgress(progress / 100);
                console.log(`预加载阅读进度: ${progress.toFixed(2)}%，等待分页完成后应用`);
              }
            } else {
              setPreloadedProgress(progress / 100);
              console.log(`预加载阅读进度: ${progress.toFixed(2)}%，等待分页完成后应用`);
            }
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
      // Calculate available reading area based on actual window size and padding
      const readingAreaHeightRaw = windowSize.height - paddingTop - paddingBottom; // Full screen height minus top and bottom padding
      const readingAreaWidth = windowSize.width - paddingLeft - paddingRight; // Full screen width minus left and right padding

      // Split content into paragraphs, keeping empty lines as separators
      const paragraphs = text.split('\n');
      // Compute total byte length once (UTF-8)
      const encoder = new TextEncoder();
      setTotalByteLength(encoder.encode(text).length);

      // Estimate lines per page based on total line height from settings (in px)
      const actualLineHeight = lineHeight;
      const snappedHeight = Math.max(
        actualLineHeight,
        Math.floor(Math.max(0, readingAreaHeightRaw) / Math.max(1, actualLineHeight)) * Math.max(1, actualLineHeight)
      );
      const linesPerPage = Math.max(3, Math.floor(snappedHeight / actualLineHeight));

      // Precise page splitting by measuring real rendered height using an offscreen measurer
      // Build a hidden measurer div with the same style
      const measurer = document.createElement('div');
      measurer.style.position = 'absolute';
      measurer.style.visibility = 'hidden';
      measurer.style.pointerEvents = 'none';
      measurer.style.top = '0';
      measurer.style.left = '0';
      measurer.style.width = `${Math.max(0, readingAreaWidth)}px`;
      measurer.style.fontSize = `${fontSize}px`;
      measurer.style.lineHeight = `${lineHeight}px`;
      measurer.style.fontFamily = fontFamily;
      measurer.style.whiteSpace = 'pre-wrap';
      measurer.style.wordBreak = 'break-word';
      measurer.style.boxSizing = 'border-box';
      measurer.style.padding = '0';
      measurer.style.margin = '0';
      document.body.appendChild(measurer);

      // Debug logging
      console.log('分页计算参数:', {
        windowHeight: windowSize.height,
        windowWidth: windowSize.width,
        readingAreaHeight: readingAreaHeightRaw,
        snappedHeight,
        readingAreaWidth,
        fontSize,
        lineHeight,
        actualLineHeight,
        linesPerPage,
        fontFamily,
        paddingTop,
        paddingBottom,
        paddingLeft,
        paddingRight,
        totalPaddingVertical: paddingTop + paddingBottom,
        totalPaddingHorizontal: paddingLeft + paddingRight
      });

      const newPages: string[] = [];
      const toc: {title: string, page: number, offset: number, byteOffset: number}[] = [];
      const pageOffsets: number[] = [];
      const pageByteOffsets: number[] = [];
      let currentPageContent = '';
      let currentLines = 0;
      let currentPageStartOffset = 0;
      let cumulativeOffset = 0; // character offset in original text
      let currentPageStartByteOffset = 0;
      let cumulativeByteOffset = 0; // byte offset in original UTF-8 text

      // Helper: detect chapter title and return a suitable TOC title
      const matchChapterTitle = (line: string): string | null => {
        const s = line.trim();
        if (!s) return null;
        if (s.length > 60) return null; // avoid overly long lines

        // Strip surrounding brackets for detection (keep original for title if needed)
        const unbracketed = s.replace(/^[\[【\(（《「『\s]+/, '').replace(/[\]】\)）》」』\s]+$/, '');

        // 1) Chinese classic: 第X章/节/卷/部/篇/回/集/话
        if (/^第[一二三四五六七八九十百千万两〇0-9]+[章节卷部篇回集话]/.test(unbracketed)) {
          return s;
        }

        // 2) Arabic numbered headings: 1. / 1、 / 1) / 1-1 / 1.1 etc., followed by some text
        if (/^\d+(?:[\.．、\-]\d+)*[\s\.．、\)）:：]+\S/.test(unbracketed)) {
          return s;
        }

        // 3) Chinese numeral headings like "一、..." or "一 标题" (must have delimiter)
        const mCn = unbracketed.match(/^([一二三四五六七八九十百千]+)(?:、|\s+)\S+/);
        if (mCn) {
          // For pure Chinese numerals, return up to first space or keep delimiter block
          const mTitle = unbracketed.match(/^([一二三四五六七八九十百千]+(?:、|\s+)[^\s]+)/);
          return mTitle ? mTitle[1] : s;
        }

        // 4) Roman numerals I, II, ... with delimiter and text
        if (/^[IVXLCDM]+(?:\.|、|\s+)\S+/i.test(unbracketed)) {
          return s;
        }

        // 5) English chapter keywords
        if (/^(?:Chapter|CHAPTER|Ch\.|Section|Part)\s+[0-9ivxlcdm]+/i.test(unbracketed)) {
          return s;
        }

        if (/^(?:Prologue|Epilogue|Preface|Foreword|Acknowledgments?)\b/i.test(unbracketed)) {
          return s;
        }

        // 6) Chinese keywords
        if (/^(?:序章|序|前言|楔子|引子|目录|致谢|后记|尾声|番外|卷[一二三四五六七八九十百千万两〇0-9IVXLCDM]+|第[一二三四五六七八九十百千万两〇0-9]+卷)/i.test(unbracketed)) {
          return s;
        }

        return null;
      };

      for (const paragraph of paragraphs) {
        const paragraphStartOffset = cumulativeOffset;
        const paragraphStartByteOffset = cumulativeByteOffset;
        // Check if this is a potential chapter title
        const trimmed = paragraph.trim();
        let chapterTitle: string | null = null;

        // Rule 1: Starts with "第" and contains "章" OR starts with "Chapter <num>"
        chapterTitle = matchChapterTitle(trimmed);

        // Calculate actual lines this paragraph will take
        // Measure rendered height of paragraph if needed
        const textToMeasure = paragraph === '' ? '\n' : paragraph + '\n';
        measurer.textContent = textToMeasure;
        const paraHeight = measurer.getBoundingClientRect().height;
        const paragraphLines = Math.max(1, Math.round(paraHeight / Math.max(1, actualLineHeight)));

        // If this paragraph is a chapter heading, force a page break BEFORE it
        if (chapterTitle) {
          if (currentPageContent.trim()) {
            newPages.push(currentPageContent.trim());
            pageOffsets.push(currentPageStartOffset);
            pageByteOffsets.push(currentPageStartByteOffset);
            currentPageContent = '';
            currentLines = 0;
          }
          // This chapter starts a new page
          toc.push({
            title: chapterTitle,
            page: newPages.length + 1,
            offset: paragraphStartOffset,
            byteOffset: paragraphStartByteOffset
          });
          currentPageStartOffset = paragraphStartOffset;
          currentPageStartByteOffset = paragraphStartByteOffset;
          currentPageContent = paragraph + '\n';
          currentLines = paragraphLines;
          // Advance cumulative offsets (including original newline) in both char and byte metrics
          cumulativeOffset += paragraph.length + 1;
          cumulativeByteOffset += encoder.encode(paragraph + '\n').length;
          continue;
        }

        // Normal pagination logic
        if (currentLines + paragraphLines > linesPerPage && currentPageContent.length > 0) {
          newPages.push(currentPageContent.trim());
          pageOffsets.push(currentPageStartOffset);
          pageByteOffsets.push(currentPageStartByteOffset);
          currentPageContent = paragraph + '\n';
          currentLines = paragraphLines;
          currentPageStartOffset = paragraphStartOffset;
          currentPageStartByteOffset = paragraphStartByteOffset;
        } else {
          currentPageContent += paragraph + '\n';
          currentLines += paragraphLines;
        }
        // Advance cumulative offsets (including original newline)
        cumulativeOffset += paragraph.length + 1;
        cumulativeByteOffset += encoder.encode(paragraph + '\n').length;
      }

      // Add the last page if it has content
      if (currentPageContent.trim()) {
        newPages.push(currentPageContent);
        pageOffsets.push(currentPageStartOffset);
        pageByteOffsets.push(currentPageStartByteOffset);
      }

      // Cleanup measurer
      if (measurer.parentNode) {
        measurer.parentNode.removeChild(measurer);
      }

      // Ensure we have at least one page
      if (newPages.length === 0) {
        newPages.push(text || '暂无内容');
      }

      const previousTotalPages = totalPages;

      setPages(newPages);
      setTotalPages(newPages.length);
      setTableOfContents(toc);
      setPageStartOffsets(pageOffsets);
      setPageStartByteOffsets(pageByteOffsets);

      // If we have an anchorByteOffset captured (e.g., from saved progress or before resize),
      // re-align to the page whose start byte offset is the nearest not greater than anchorByteOffset.
      if (anchorByteOffset !== null && pageByteOffsets.length > 0) {
        const pageIndexByByte = (() => {
          for (let i = pageByteOffsets.length - 1; i >= 0; i--) {
            if (pageByteOffsets[i] <= anchorByteOffset) return i;
          }
          return 0;
        })();
        const targetPageByByte = pageIndexByByte + 1;
        if (targetPageByByte !== currentPage) {
          setCurrentPage(targetPageByByte);
        }
      } else if (anchorOffset !== null && pageOffsets.length > 0) {
        const pageIndex = (() => {
          for (let i = pageOffsets.length - 1; i >= 0; i--) {
            if (pageOffsets[i] <= anchorOffset) return i;
          }
          return 0;
        })();
        const targetPage = pageIndex + 1;
        if (targetPage !== currentPage) {
          setCurrentPage(targetPage);
        }
      }

      console.log('分页完成:', {
        totalPages: newPages.length,
        preloadedProgress,
        currentPage
      });

      // Set initial page only for first pagination; subsequent realignment uses byte/char anchors
      if (newPages.length > 0) {
        if (previousTotalPages === 0 && !isRestoringRef.current) {
          setCurrentPage(1);
        }
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
      // Clear any preloaded progress when loading a new book
      setPreloadedProgress(null);
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
                setCurrentPage(prev => Math.max(1, prev - 1));
                setShowTableOfContents(false);
                // Save reading progress after page change
                saveReadingProgress();
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
                setCurrentPage(prev => Math.min(totalPages, prev + 1));
                setShowTableOfContents(false);
                // Save reading progress after page change
                saveReadingProgress();
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
                          <span>{bookmark.progress.toFixed(2)}%</span>
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
                          // Recompute target page for this chapter by matching its character offset
                          // against current pageStartOffsets to adapt to dynamic layout changes
                          let targetPage = item.page;
                          if (pageStartOffsets && pageStartOffsets.length > 0) {
                            // Find the largest page index whose start offset <= chapter offset
                            const idx = pageStartOffsets.findIndex((start, i) => {
                              const nextStart = pageStartOffsets[i + 1] ?? Number.POSITIVE_INFINITY;
                              return start <= item.offset && item.offset < nextStart;
                            });
                            if (idx >= 0) {
                              targetPage = idx + 1;
                            }
                          }
                          targetPage = Math.max(1, Math.min(totalPages, targetPage));
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
