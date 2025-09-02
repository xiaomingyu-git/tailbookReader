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
  const [tableOfContents, setTableOfContents] = useState<{title: string, page: number}[]>([]);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [readingProgress, setReadingProgress] = useState(0);
  const [preloadedProgress, setPreloadedProgress] = useState<number | null>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [progressFilePath, setProgressFilePath] = useState<string>('');
  const [settingsFilePath, setSettingsFilePath] = useState<string>('');
  const [startTime, setStartTime] = useState<Date>(new Date());

  // New state variables for settings
  const [showColorSettings, setShowColorSettings] = useState(false);
  const [showFontSettings, setShowFontSettings] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState('#f8f9fa');
  const [brightness, setBrightness] = useState(100);
  const [lineHeight, setLineHeight] = useState(1.8);
  const [fontFamily, setFontFamily] = useState('system-ui, -apple-system, sans-serif');
  const [paddingTop, setPaddingTop] = useState(60);
  const [paddingBottom, setPaddingBottom] = useState(60);
  const [paddingLeft, setPaddingLeft] = useState(80);
  const [paddingRight, setPaddingRight] = useState(80);
  const [isBookmarkJumping, setIsBookmarkJumping] = useState(false);

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
  }, [search]);

  // Window resize listener with debounce
  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout;

    const handleResize = () => {
      // Clear the previous timeout
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

      // Set a new timeout to update window size after resize stops
      resizeTimeout = setTimeout(() => {
        setWindowSize({ width: window.innerWidth, height: window.innerHeight });
      }, 300); // 300ms debounce
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
      setReadingProgress((currentPage - 1) / totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (content) {
      paginateContent(content);
    } else if (!loading) {
      // If no content and not loading, set default page
      setPages(['暂无内容']);
      setTotalPages(1);
      setCurrentPage(1);
    }
  }, [content, fontSize, windowSize, paddingTop, paddingBottom, paddingLeft, paddingRight]);

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
      // Calculate progress percentage with 2 decimal places
      const progressPercentage = totalPages > 0 ? Math.round(((pageToSave - 1) / totalPages) * 10000) / 100 : 0;

      // Prepare progress data
      const progressData = {
        bookId: book.id,
        progress: progressPercentage,
        currentPage: pageToSave,
        totalPages: totalPages,
        lastReadAt: new Date().toISOString(),
        readingTime: Math.floor((new Date().getTime() - startTime.getTime()) / (1000 * 60)),
        bookmarks: book.bookmarks || [],
        lastUpdated: new Date().toISOString()
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
      // Calculate target page from progress percentage
      const targetPage = Math.max(1, Math.min(totalPages, Math.round((progressPercentage / 100) * totalPages) + 1));

      // Prepare progress data
      const progressData = {
        bookId: book.id,
        progress: progressPercentage,
        currentPage: targetPage,
        totalPages: totalPages,
        lastReadAt: new Date().toISOString(),
        readingTime: Math.floor((new Date().getTime() - startTime.getTime()) / (1000 * 60)),
        bookmarks: book.bookmarks || [],
        lastUpdated: new Date().toISOString()
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
  const loadReadingProgressImmediate = async (bookId: string) => {
    if (isBookmarkJumping) return;

    try {
      if (window.electronAPI) {
        console.log(`开始加载书籍 ${bookId} 的阅读进度...`);
        const result = await window.electronAPI.loadBookProgress(bookId);
        console.log('进度加载结果:', result);

        if (result.success && result.data) {
          const progressData = result.data;
          const { progress, readingTime } = progressData;
          console.log('进度数据:', { progress, readingTime });

          // Store progress data for later use after pagination
          if (progress > 0) {
            // Update reading time immediately
            if (readingTime > 0) {
              const newStartTime = new Date();
              newStartTime.setMinutes(newStartTime.getMinutes() - readingTime);
              setStartTime(newStartTime);
            }

            // Store preloaded progress for later application after pagination
            setPreloadedProgress(progress / 100);
            console.log(`预加载阅读进度: ${progress.toFixed(2)}%，等待分页完成后应用`);
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
        await window.electronAPI.writeFile(settingsFilePath, JSON.stringify(settings, null, 2));
        console.log('用户设置已保存');
      }
    } catch (error) {
      console.error('保存用户设置失败:', error);
    }
  };

  // Load user settings from settings.json
  const loadUserSettings = async () => {
    if (!settingsFilePath) return;

    try {
      if (window.electronAPI) {
        const existingData = await window.electronAPI.readFile(settingsFilePath);
        if (existingData) {
          const settings: UserSettings = JSON.parse(existingData);

          setFontSize(settings.fontSize || 16);
          setLineHeight(settings.lineHeight || 1.8);
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
      const readingAreaHeight = windowSize.height - paddingTop - paddingBottom; // Full screen height minus top and bottom padding
      const readingAreaWidth = windowSize.width - paddingLeft - paddingRight; // Full screen width minus left and right padding

      // Split content into paragraphs, keeping empty lines as separators
      const paragraphs = text.split('\n');

      // Estimate lines per page based on font size, line height setting and actual available height
      const actualLineHeight = fontSize * lineHeight;
      const linesPerPage = Math.max(3, Math.floor(readingAreaHeight / actualLineHeight));

      // Estimate characters per line based on actual width and font
      // Different fonts have different character widths, adjust multiplier accordingly
      const charWidthMultiplier = fontFamily.includes('monospace') ? 0.6 :
                                 fontFamily.includes('serif') ? 0.55 : 0.6;
      const charsPerLine = Math.floor(readingAreaWidth / (fontSize * charWidthMultiplier));

      // Debug logging
      console.log('分页计算参数:', {
        windowHeight: windowSize.height,
        windowWidth: windowSize.width,
        readingAreaHeight,
        readingAreaWidth,
        fontSize,
        lineHeight,
        actualLineHeight,
        linesPerPage,
        charsPerLine,
        fontFamily,
        charWidthMultiplier,
        paddingTop,
        paddingBottom,
        paddingLeft,
        paddingRight,
        totalPaddingVertical: paddingTop + paddingBottom,
        totalPaddingHorizontal: paddingLeft + paddingRight
      });

      const newPages: string[] = [];
      const toc: {title: string, page: number}[] = [];
      let currentPageContent = '';
      let currentLines = 0;

      for (const paragraph of paragraphs) {
        // Check if this is a potential chapter title (starts with "第" and contains "章" or starts with "Chapter")
        if (/^第\S*章/.test(paragraph.trim()) || /^Chapter\s+\d+/i.test(paragraph.trim())) {
          toc.push({
            title: paragraph.trim(),
            page: newPages.length + 1
          });
        }

        // Calculate actual lines this paragraph will take
        const paragraphLines = paragraph.trim() === '' ? 1 : Math.max(1, Math.ceil(paragraph.length / charsPerLine));

                // If adding this paragraph would exceed page limits, start a new page
        if (currentLines + paragraphLines > linesPerPage && currentPageContent.length > 0) {
          newPages.push(currentPageContent.trim());
          currentPageContent = paragraph + '\n';
          currentLines = paragraphLines;
        } else {
          currentPageContent += paragraph + '\n';
          currentLines += paragraphLines;
        }
      }

      // Add the last page if it has content
      if (currentPageContent.trim()) {
        newPages.push(currentPageContent);
      }

      // Ensure we have at least one page
      if (newPages.length === 0) {
        newPages.push(text || '暂无内容');
      }

      const previousTotalPages = totalPages;

      setPages(newPages);
      setTotalPages(newPages.length);
      setTableOfContents(toc);

      console.log('分页完成:', {
        totalPages: newPages.length,
        preloadedProgress,
        currentPage
      });

      // Set initial page after pagination
      if (newPages.length > 0) {
        if (previousTotalPages > 0) {
          // Preserve existing progress when repaginating
          const targetPage = Math.max(1, Math.min(newPages.length, Math.round(readingProgress * newPages.length) + 1));
          setCurrentPage(targetPage);
        } else {
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
            await loadReadingProgressImmediate(selectedBook.id);
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
              height: '100%',
              fontSize: `${fontSize}px`,
              lineHeight: lineHeight,
              fontFamily: fontFamily,
              color: '#333',
              whiteSpace: 'pre-line',
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

                {/* Line Height Control */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>行距</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '12px', color: '#999' }}>紧</span>
                    <input
                      type="range"
                      min="1.2"
                      max="2.5"
                      step="0.1"
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
                    {lineHeight.toFixed(1)}
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
                          // Calculate progress percentage based on chapter page
                          const chapterProgress = totalPages > 0 ? Math.round(((item.page - 1) / totalPages) * 100) : 0;
                          const targetPage = Math.max(1, Math.min(totalPages, Math.round((chapterProgress / 100) * totalPages) + 1));
                          setCurrentPage(targetPage);
                          setShowTableOfContents(false);
                          // Save reading progress after jumping to chapter
                          saveReadingProgress();
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
