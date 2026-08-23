'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TeamCalendar({ allGames = [] }) {
  // Try to set initial month to the month of the last completed game, or today's month
  const initialDate = useMemo(() => {
    if (allGames.length === 0) return new Date();
    
    // Find the last completed game, or the first upcoming game
    const lastGame = [...allGames].reverse().find(g => g.result);
    if (lastGame) return new Date(lastGame.date);

    return new Date(allGames[0].date);
  }, [allGames]);

  const [currentMonth, setCurrentMonth] = useState(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));

  // Calendar calculations
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  // Group games by date string (YYYY-MM-DD local time)
  const gamesByDate = useMemo(() => {
    const map = {};
    allGames.forEach(game => {
      const d = new Date(game.date);
      // We want local date strings
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(game);
    });
    return map;
  }, [allGames]);

  const router = useRouter();

  const handleCellClick = (dayGames) => {
    if (dayGames && dayGames.length > 0) {
      router.push(`/game/nba/${dayGames[0].id}`);
    }
  };

  // Generate grid cells
  const renderCells = () => {
    const cells = [];
    
    // Empty cells before the 1st
    for (let i = 0; i < firstDayOfMonth; i++) {
      cells.push(<div key={`empty-${i}`} className="cal-cell empty"></div>);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayGames = gamesByDate[dateKey] || [];

      let background = 'var(--primary-bg)'; // Default white/primary
      let isFuture = false;

      // Calculate colors
      if (dayGames.length > 0) {
        const colors = dayGames.map(g => {
          if (g.result === 'W') return '#22c55e'; // Green
          if (g.result === 'L') return '#ef4444'; // Red
          if (g.result === 'T') return '#eab308'; // Yellow
          isFuture = true;
          return 'transparent'; // No game yet
        });

        if (colors.length === 1) {
          background = colors[0] !== 'transparent' ? colors[0] : 'var(--primary-bg)';
        } else if (colors.length > 1) {
          // Double header split gradient
          // If both future, keep it primary. Else do a gradient.
          if (colors.every(c => c === 'transparent')) {
            background = 'var(--primary-bg)';
          } else {
            // Replace transparent with primary for gradient
            const safeColors = colors.map(c => c === 'transparent' ? 'var(--primary-bg)' : c);
            const stops = safeColors.map((c, i) => `${c} ${(100 / safeColors.length) * i}%, ${c} ${(100 / safeColors.length) * (i + 1)}%`).join(', ');
            background = `linear-gradient(to right, ${stops})`;
          }
        }
      }

      // Tooltip logic
      let tooltipContent = null;
      if (dayGames.length > 0) {
        tooltipContent = dayGames.map((g, i) => {
          const vsAt = g.isHome ? 'vs' : '@';
          let resultStr = g.status;
          if (g.result) {
            resultStr = `${g.result} ${g.ourScore}-${g.theirScore}`;
          }
          return `${vsAt} ${g.opponentName} (${resultStr})`;
        }).join(' | ');
      }

      const cellStyle = {
        background,
        color: dayGames.length > 0 && !isFuture && background !== 'var(--primary-bg)' ? 'white' : 'var(--text-primary)',
        borderColor: isFuture ? 'var(--text-secondary)' : 'var(--border-color)', // Highlight future scheduled games
        borderWidth: isFuture ? '2px' : '1px'
      };

      cells.push(
        <div 
          key={day} 
          className={`cal-cell ${dayGames.length > 0 ? 'has-game' : ''}`}
          style={cellStyle}
          title={tooltipContent || undefined}
          onClick={() => handleCellClick(dayGames)}
        >
          <span className="cal-day-num">{day}</span>
        </div>
      );
    }

    return cells;
  };

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <div className="team-calendar-container">
      <div className="cal-header">
        <button onClick={prevMonth} className="cal-nav-btn">&larr;</button>
        <h3 className="cal-month-title">{monthNames[month]} {year}</h3>
        <button onClick={nextMonth} className="cal-nav-btn">&rarr;</button>
      </div>

      <div className="cal-grid">
        {DAYS_OF_WEEK.map(d => (
          <div key={d} className="cal-day-header">{d}</div>
        ))}
        {renderCells()}
      </div>

      <div className="cal-legend">
        <div className="legend-item"><span className="legend-color" style={{background: '#22c55e'}}></span> Win</div>
        <div className="legend-item"><span className="legend-color" style={{background: '#ef4444'}}></span> Loss</div>
        <div className="legend-item"><span className="legend-color" style={{background: '#eab308'}}></span> Tie</div>
        <div className="legend-item"><span className="legend-color" style={{background: 'var(--primary-bg)', border: '2px solid var(--text-secondary)'}}></span> Scheduled</div>
      </div>
    </div>
  );
}
