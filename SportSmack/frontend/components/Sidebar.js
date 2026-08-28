import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar({ collapsed, onToggle }) {
  const pathname = usePathname();

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <nav className="sidebar-nav">
        <Link href="/" className={`sidebar-link ${pathname === '/' ? 'active' : ''}`}>
          Home
        </Link>
        <Link href="/explore" className={`sidebar-link ${pathname === '/explore' ? 'active' : ''}`}>
          Explore / Teams
        </Link>
        <Link href="/forums" className={`sidebar-link ${pathname === '/forums' ? 'active' : ''}`}>
          🗣️ Forums
        </Link>
        <Link href="/scores" className={`sidebar-link ${pathname === '/scores' ? 'active' : ''}`}>
          <span style={{ color: 'var(--accent-color)', fontWeight: 'bold', marginRight: '8px' }}>●</span> Live Scores
        </Link>
        <Link href="/hubs" className={`sidebar-link ${pathname === '/hubs' ? 'active' : ''}`}>
          🏆 Sports Hubs
        </Link>
        <Link href="/notifications" className={`sidebar-link ${pathname === '/notifications' ? 'active' : ''}`}>
          Notifications
        </Link>
        <Link href="/profile" className={`sidebar-link ${pathname === '/profile' ? 'active' : ''}`}>
          Profile
        </Link>
      </nav>
    </aside>
  );
}
