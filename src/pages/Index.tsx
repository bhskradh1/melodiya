import React from 'react';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { AuthPage } from '@/components/auth/AuthPage';
import { MelodiyaApp } from '@/components/music/MelodiyaApp';
import { useAuth } from '@/components/auth/AuthProvider';
import { PreferencesProvider } from '@/contexts/PreferencesContext';

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    // Same look as the splash in index.html so there is no visible jump
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <img src="/icon-192x192.png" alt="" className="h-24 w-24 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return <MelodiyaApp />;
};

const Index = () => {
  return (
    <AuthProvider>
      <PreferencesProvider>
        <AppContent />
      </PreferencesProvider>
    </AuthProvider>
  );
};

export default Index;
