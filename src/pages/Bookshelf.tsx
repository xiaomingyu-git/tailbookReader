import React from 'react';
import { Link } from '@tanstack/react-router';

interface Book {
  id: number;
  title: string;
  author: string;
  cover: string;
  progress: number;
}

const Bookshelf: React.FC = () => {
  const books: Book[] = [
    {
      id: 1,
      title: "示例书籍1",
      author: "作者1",
      cover: "https://via.placeholder.com/120x160/4a90e2/ffffff?text=书1",
      progress: 30
    },
    {
      id: 2,
      title: "示例书籍2",
      author: "作者2", 
      cover: "https://via.placeholder.com/120x160/50c878/ffffff?text=书2",
      progress: 75
    },
    {
      id: 3,
      title: "示例书籍3",
      author: "作者3",
      cover: "https://via.placeholder.com/120x160/ff6b6b/ffffff?text=书3",
      progress: 10
    }
  ];

  return (
    <div style={{ 
      padding: '20px',
      minHeight: 'calc(100vh - 80px)'
    }}>
      <h1 style={{ 
        marginBottom: '30px',
        color: '#333',
        fontSize: '24px',
        fontWeight: 'normal'
      }}>
        我的书架
      </h1>
      
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
            <Link to="/reading" style={{ textDecoration: 'none', color: 'inherit' }}>
              <img 
                src={book.cover} 
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
                lineHeight: '1.3'
              }}>
                {book.title}
              </h3>
              <p style={{
                fontSize: '12px',
                color: '#666',
                marginBottom: '8px'
              }}>
                {book.author}
              </p>
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
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Bookshelf;