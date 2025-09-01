import React, { useState, useEffect } from 'react';
import { Link, useSearch } from '@tanstack/react-router';

interface Book {
  id: string;
  title: string;
  author?: string;
  fileName: string;
  filePath: string;
  size: number;
  addedAt: string;
}

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
  const [showToolbar, setShowToolbar] = useState(false);

  useEffect(() => {
    loadBook();
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
  }, [content, fontSize, windowSize]);

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

  const paginateContent = (text: string) => {
    try {
      // Calculate available reading area based on actual window size
      const readingAreaHeight = windowSize.height - 140; // Account for padding and UI elements
      const readingAreaWidth = Math.min(800, windowSize.width - 160); // Max 800px width, account for padding
      
      // Split content into paragraphs, keeping empty lines as separators
      const paragraphs = text.split('\n');
      
      // Estimate lines per page based on font size and actual available height
      const lineHeight = fontSize * 1.8;
      const linesPerPage = Math.max(5, Math.floor(readingAreaHeight / lineHeight));
      
      // Estimate characters per line based on actual width
      const charsPerLine = Math.floor(readingAreaWidth / (fontSize * 0.6));
      
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
          newPages.push(currentPageContent);
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
      
      // Preserve reading progress when repaginating
      if (previousTotalPages > 0 && newPages.length > 0) {
        const targetPage = Math.max(1, Math.min(newPages.length, Math.round(readingProgress * newPages.length) + 1));
        setCurrentPage(targetPage);
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
      const bookId = (search as any)?.bookId;
      if (!bookId) {
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
        const books = await window.electronAPI.getBooks();
        const selectedBook = books.find(b => b.id === bookId);
        
        if (selectedBook) {
          setBook(selectedBook);
          try {
            const bookContent = await window.electronAPI.readBookContent(selectedBook.filePath);
            setContent(bookContent.content);
            
            // Show encoding info in console for debugging
            if (bookContent.encoding) {
              console.log(`文件编码: ${bookContent.encoding}`);
            }
          } catch (readError) {
            console.error('读取书籍内容失败:', readError);
            const errorMessage = readError instanceof Error ? readError.message : String(readError);
            setContent(`读取书籍内容时出错: ${errorMessage}\n\n请确保文件存在且没有被其他程序占用。`);
          }
        } else {
          // Handle sample books or fallback
          setContent(getSampleContent());
          setBook({
            id: bookId,
            title: bookId === 'sample1' ? '示例书籍1' : bookId === 'sample2' ? '示例书籍2' : '示例书籍',
            author: bookId === 'sample1' ? '作者1' : bookId === 'sample2' ? '作者2' : '示例作者',
            fileName: 'sample.txt',
            filePath: '/sample/path',
            size: 1024,
            addedAt: new Date().toISOString()
          });
        }
      } else {
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
      console.error('Error loading book:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setContent(`加载书籍时出错: ${errorMessage}\n\n请刷新页面重试。`);
    } finally {
      setLoading(false);
    }
  };

  const getSampleContent = () => `这是一个示例阅读页面。在这里，您可以阅读您选择的书籍内容。

第一章 开始的故事

在一个阳光明媚的早晨，主人公踏上了他的冒险之旅。这是一个关于成长、友谊和发现的故事。

他走在石板路上，脚步声在安静的街道上回响。周围的建筑古朴而优雅，仿佛在诉说着历史的故事。

"这将是一段不平凡的旅程，"他心想，"我必须准备好面对前方的挑战。"

远处传来鸟儿的啁啾声，微风轻拂过他的脸庞。这是一个新的开始，充满了无限的可能性。

随着故事的展开，我们将跟随主人公一起经历各种冒险，见证他的成长和蜕变。每一页都将带来新的惊喜和感动。

第二章 新的发现

故事继续展开，主人公遇到了更多有趣的角色和挑战。每一次经历都让他变得更加成熟和睿智。

这就是阅读的魅力所在——通过文字，我们可以体验无数个不同的世界和人生。

第三章 冒险的高潮

在这一章中，所有的线索都开始汇聚，故事达到了激动人心的高潮部分。

主人公必须做出关键的选择，这将决定整个故事的走向。

第四章 圆满的结局

经过重重考验，主人公终于完成了他的使命。这是一个关于成长、勇气和友谊的美好故事。

故事告诉我们，只要坚持梦想，勇敢面对困难，最终都能收获属于自己的幸福和成功。`;

  return (
    <div style={{ 
      height: '100vh',
      width: '100vw',
      position: 'relative',
      backgroundColor: '#fefefe',
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
              justifyContent: 'center',
              alignItems: 'center',
              padding: '60px 80px',
              cursor: 'pointer'
            }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX;
              const leftThird = rect.left + rect.width / 3;
              const rightThird = rect.left + (rect.width * 2) / 3;
              
              // If clicked in the left third, go to previous page
              if (clickX < leftThird) {
                setCurrentPage(prev => Math.max(1, prev - 1));
                setShowToolbar(false);
                setShowTableOfContents(false);
              }
              // If clicked in right third, go to next page
              else if (clickX > rightThird) {
                setCurrentPage(prev => Math.min(totalPages, prev + 1));
                setShowToolbar(false);
                setShowTableOfContents(false);
              }
              // Middle third - toggle toolbar
              else {
                setShowToolbar(prev => !prev);
                setShowTableOfContents(false);
              }
            }}
          >
            <div style={{
              maxWidth: '800px',
              width: '100%',
              fontSize: `${fontSize}px`,
              lineHeight: '1.8',
              color: '#333',
              whiteSpace: 'pre-line',
              textAlign: 'left'
            }}>
              {pages.length > 0 ? (pages[currentPage - 1] || '暂无内容') : '正在处理内容...'}
            </div>
          </div>

          {/* Floating toolbar - only show when showToolbar is true */}
          {showToolbar && (
            <>
              {/* Top toolbar */}
              <div style={{
                position: 'fixed',
                top: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '10px',
                zIndex: 100,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: '10px 20px',
                borderRadius: '25px',
                backdropFilter: 'blur(10px)'
              }}>
                <Link to="/" style={{
                  padding: '8px 12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  color: '#4a90e2',
                  fontSize: '14px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                }}>
                  返回书架
                </Link>
                <button 
                  onClick={() => setShowTableOfContents(true)}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                  }}
                >
                  目录
                </button>
                <button 
                  onClick={() => setFontSize(Math.max(12, fontSize - 2))}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                  }}
                >
                  A-
                </button>
                <span style={{
                  padding: '8px 12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  color: '#666',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                }}>
                  {fontSize}px
                </span>
                <button 
                  onClick={() => setFontSize(Math.min(24, fontSize + 2))}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                  }}
                >
                  A+
                </button>
              </div>

              {/* Page indicator */}
              <div style={{
                position: 'fixed',
                bottom: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                color: 'white',
                padding: '12px 20px',
                borderRadius: '25px',
                fontSize: '14px',
                zIndex: 100,
                backdropFilter: 'blur(10px)'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div>{book ? `${book.title}${book.author ? ` - ${book.author}` : ''}` : '当前书籍'}</div>
                  <div style={{ marginTop: '4px', fontSize: '12px', opacity: 0.8 }}>
                    {currentPage} / {totalPages} ({Math.round(((currentPage - 1) / Math.max(1, totalPages - 1)) * 100)}%)
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div style={{
                position: 'fixed',
                bottom: '80px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '15px',
                fontSize: '12px',
                zIndex: 50,
                textAlign: 'center',
                backdropFilter: 'blur(10px)'
              }}>
                <div>← → 键或点击左右翻页 | 空格键或点击中间显示/隐藏工具栏</div>
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
                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '10px 0'
                }}>
                  {tableOfContents.length > 0 ? (
                    tableOfContents.map((item, index) => (
                      <div
                        key={index}
                        style={{
                          padding: '10px 20px',
                          cursor: 'pointer',
                          borderBottom: '1px solid #f5f5f5',
                          backgroundColor: currentPage === item.page ? '#f0f7ff' : 'transparent',
                          color: currentPage === item.page ? '#4a90e2' : '#333'
                        }}
                        onClick={() => {
                          setCurrentPage(item.page);
                          setShowTableOfContents(false);
                        }}
                      >
                        <div style={{ fontSize: '14px', marginBottom: '4px' }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: '12px', color: '#999' }}>
                          第 {item.page} 页
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