import React from 'react';
import { Platform } from 'react-native';

interface FormSurfaceProps {
  children: React.ReactNode;
  onSubmit(): void;
}

export function FormSurface({ children, onSubmit }: FormSurfaceProps) {
  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      style={{ display: 'contents' }}
    >
      {children}
    </form>
  );
}
