import React, { useState } from 'react';
import { Link } from '@tanstack/react-router';

const Reading: React.FC = () => {
  const [fontSize, setFontSize] = useState(16);
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = 256;

  const sampleText = `
    这是一个示例阅读页面。在这里，您可以阅读您选择的书籍内容。

    第一章 开始的故事

    在一个阳光明媚的早晨，主人公踏上了他的冒险之旅。这是一个关于成长、友谊和发现的故事。

    他走在石板路上，脚步声在安静的街道上回响。周围的建筑古朴而优雅，仿佛在诉说着历史的故事。

    "这将是一段不平凡的旅程，"他心想，"我必须准备好面对前方的挑战。"

    远处传来鸟儿的啁啾声，微风轻拂过他的脸庞。这是一个新的开始，充满了无限的可能性。

    随着故事的展开，我们将跟随主人公一起经历各种冒险，见证他的成长和蜕变。每一页都将带来新的惊喜和感动。
  `;

  return (
    <div style={{ 
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 80px)'
    }}>
      {/* 工具栏 */}
      <div style={{
        backgroundColor: 'white',
        padding: '10px 20px',
        borderBottom: '1px solid #eee',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <Link to="/" style={{ 
            textDecoration: 'none', 
            color: '#4a90e2',
            fontSize: '14px'
          }}>
            ← 返回书架
          </Link>
          <span style={{ color: '#666', fontSize: '14px' }}>
            示例书籍1 - 作者1
          </span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#666' }}>字体大小:</span>
            <button 
              onClick={() => setFontSize(Math.max(12, fontSize - 2))}
              style={{
                padding: '4px 8px',
                border: '1px solid #ddd',
                backgroundColor: 'white',
                cursor: 'pointer',
                borderRadius: '4px'
              }}
            >
              A-
            </button>
            <span style={{ fontSize: '12px', color: '#666' }}>{fontSize}px</span>
            <button 
              onClick={() => setFontSize(Math.min(24, fontSize + 2))}
              style={{
                padding: '4px 8px',
                border: '1px solid #ddd',
                backgroundColor: 'white',
                cursor: 'pointer',
                borderRadius: '4px'
              }}
            >
              A+
            </button>
          </div>
        </div>
      </div>

      {/* 阅读区域 */}
      <div style={{
        flex: 1,
        backgroundColor: '#fefefe',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{
          flex: 1,
          maxWidth: '800px',
          margin: '0 auto',
          padding: '40px 20px',
          fontSize: `${fontSize}px`,
          lineHeight: '1.8',
          color: '#333'
        }}>
          <div style={{ whiteSpace: 'pre-line' }}>
            {sampleText}
          </div>
        </div>

        {/* 页面控制 */}
        <div style={{
          backgroundColor: 'white',
          borderTop: '1px solid #eee',
          padding: '15px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <button 
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            style={{
              padding: '8px 16px',
              border: '1px solid #ddd',
              backgroundColor: currentPage === 1 ? '#f5f5f5' : 'white',
              color: currentPage === 1 ? '#999' : '#333',
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              borderRadius: '4px'
            }}
          >
            上一页
          </button>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '14px',
            color: '#666'
          }}>
            <span>第 {currentPage} 页，共 {totalPages} 页</span>
            <div style={{
              width: '200px',
              height: '4px',
              backgroundColor: '#eee',
              borderRadius: '2px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${(currentPage / totalPages) * 100}%`,
                height: '100%',
                backgroundColor: '#4a90e2',
                transition: 'width 0.3s'
              }} />
            </div>
            <span>{Math.round((currentPage / totalPages) * 100)}%</span>
          </div>

          <button 
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            style={{
              padding: '8px 16px',
              border: '1px solid #ddd',
              backgroundColor: currentPage === totalPages ? '#f5f5f5' : 'white',
              color: currentPage === totalPages ? '#999' : '#333',
              cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
              borderRadius: '4px'
            }}
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
};

export default Reading;