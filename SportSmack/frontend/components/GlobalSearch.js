'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown if clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search logic
  useEffect(() => {
    if (query.trim() === '') {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    setIsOpen(true);

    const timerId = setTimeout(async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/search?q=${encodeURIComponent(query)}`, {
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          setResults(data);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timerId);
  }, [query]);

  const handleResultClick = () => {
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div className="global-search-container" ref={dropdownRef}>
      <input
        type="text"
        className="global-search-input"
        placeholder="Search users or teams..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (query.trim() !== '') setIsOpen(true); }}
      />
      
      {isOpen && (
        <div className="global-search-dropdown">
          {loading ? (
            <div className="search-no-results">Searching...</div>
          ) : results.length > 0 ? (
            results.map((result, idx) => {
              const href = result.type === 'user' ? `/profile/${result.id}` : `/team/${result.id}`;
              return (
                <Link key={`${result.type}-${result.id}-${idx}`} href={href} className="search-result-item" onClick={handleResultClick}>
                  {result.type === 'team' ? (
                    <img src={result.avatar} alt="logo" className="search-result-avatar" />
                  ) : (
                    <div className="search-result-avatar">{result.avatar}</div>
                  )}
                  <div className="search-result-info">
                    <span className="search-result-name">{result.displayName}</span>
                    <span className="search-result-type">{result.type}</span>
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="search-no-results">No results found for "{query}"</div>
          )}
        </div>
      )}
    </div>
  );
}
