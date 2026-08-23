import './globals.css';
import Header from '../components/Header';
import LayoutWrapper from '../components/LayoutWrapper';
import { AuthProvider } from './context/AuthContext';

export const metadata = {
  title: 'SportSmack',
  description: 'The ultimate sports social media platform.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <div className="app-container">
            <Header />
            <LayoutWrapper>
              {children}
            </LayoutWrapper>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
