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
  progress?: number;
}

declare global {
  interface Window {
    electronAPI: {
      openBookDialog: () => Promise<string | null>;
      copyBookToLibrary: (sourcePath: string) => Promise<Book>;
      getBooks: () => Promise<Book[]>;
      readBookContent: (bookPath: string) => Promise<{ content: string; type: string; encoding?: string }>;
    };
  }
}

const Bookshelf: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  // Sample books for demo
  const sampleBooks: Book[] = [
    {
      id: "sample1",
      title: "示例书籍1",
      author: "作者1",
      fileName: "sample1.txt",
      filePath: "/sample/path1",
      size: 1024,
      addedAt: new Date().toISOString(),
      progress: 30
    },
    {
      id: "sample2",
      title: "示例书籍2",
      author: "作者2",
      fileName: "sample2.txt",
      filePath: "/sample/path2",
      size: 2048,
      addedAt: new Date().toISOString(),
      progress: 75
    }
  ];

  useEffect(() => {
    loadBooks();
  }, []);

  const loadBooks = async () => {
    try {
      if (window.electronAPI) {
        const libraryBooks = await window.electronAPI.getBooks();
        setBooks([...sampleBooks, ...libraryBooks]);
      } else {
        setBooks(sampleBooks);
      }
    } catch (error) {
      console.error('Error loading books:', error);
      setBooks(sampleBooks);
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

      const filePath = await window.electronAPI.openBookDialog();
      if (filePath) {
        const book = await window.electronAPI.copyBookToLibrary(filePath);
        setBooks(prevBooks => [...prevBooks, book]);
        alert('书籍添加成功！');
      }
    } catch (error) {
      console.error('Error adding book:', error);
      alert('添加书籍时出错：' + error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const getBookCover = (book: Book) => {
    if (book.id.startsWith('sample')) {
      return `https://via.placeholder.com/120x160/${book.id === 'sample1' ? '4a90e2' : book.id === 'sample2' ? '50c878' : 'ff6b6b'}/ffffff?text=${encodeURIComponent(book.title.slice(-1))}`;
    }
    
    // Generate color based on file extension
    const ext = book.fileName.split('.').pop()?.toLowerCase();
    const colorMap: Record<string, string> = {
      'txt': '4a90e2',
      'pdf': 'e74c3c',
      'epub': '9b59b6',
      'mobi': '27ae60',
    };
    const color = colorMap[ext || 'txt'] || '95a5a6';
    
    return `https://via.placeholder.com/120x160/${color}/ffffff?text=${encodeURIComponent(ext?.toUpperCase() || 'BOOK')}`;
  };

  return (
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
        
        <button
          onClick={handleAddBook}
          style={{
            padding: '10px 20px',
            backgroundColor: '#4a90e2',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#357abd';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#4a90e2';
          }}
        >
          + 添加本地书籍
        </button>
      </div>
      
      {loading ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '50px', 
          color: '#666' 
        }}>
          正在加载书籍...
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
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
            }}
            >
              <Link 
                to="/reading" 
                search={{ bookId: book.id }}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <img 
                  src={getBookCover(book)} 
                  alt={book.title}
                  style={{
                    width: '100%',
                    height: '160px',
                    objectFit: 'cover',
                    borderRadius: '4px',
                    marginBottom: '10px'
                  }}
                />
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
                {book.progress !== undefined && (
                  <div style={{
                    fontSize: '12px',
                    color: '#999'
                  }}>
                    进度: {book.progress}%
                    <div style={{
                      width: '100%',
                      height: '4px',
                      backgroundColor: '#eee',
                      borderRadius: '2px',
                      marginTop: '4px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${book.progress}%`,
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
    </div>
  );
};

export default Bookshelf;