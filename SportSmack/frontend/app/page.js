import Feed from '../components/Feed';
import ProtectedRoute from '../components/ProtectedRoute';

export default function Home() {
  return (
    <ProtectedRoute>
      <Feed />
    </ProtectedRoute>
  );
}
