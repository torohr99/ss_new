import React from 'react';

export default function NewsCard({ article }) {
  if (!article) return null;

  return (
    <a href={article.link} target="_blank" rel="noopener noreferrer" className="news-card-link">
      <div className="news-card">
        {article.image ? (
          <div className="news-card-image-wrapper">
            <img src={article.image} alt={article.headline} className="news-card-image" loading="lazy" />
          </div>
        ) : (
          <div className="news-card-image-wrapper placeholder">
            <span className="placeholder-text">ESPN News</span>
          </div>
        )}
        <div className="news-card-content">
          <div className="news-card-badge">BREAKING NEWS</div>
          <h3 className="news-card-headline">{article.headline}</h3>
          <p className="news-card-description">{article.description}</p>
          <div className="news-card-meta">
            <span>{new Date(article.published).toLocaleString()}</span>
            <span className="read-more">Read on ESPN &rarr;</span>
          </div>
        </div>
      </div>
    </a>
  );
}
