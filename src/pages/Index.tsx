import React from 'react';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { AuthPage } from '@/components/auth/AuthPage';
import { MelodiyaApp } from '@/components/music/MelodiyaApp';
import { useAuth } from '@/components/auth/AuthProvider';
import { PreferencesProvider } from '@/contexts/PreferencesContext';

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading Melodiya...</p>
        </div>
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
