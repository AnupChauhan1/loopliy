'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { homeFor } from '@/lib/roles';

export default function Home() {
  const { role, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(homeFor(role));
    }
  }, [isLoading, isAuthenticated, role, router]);

  return (
    <div className="flex items-center justify-center h-96">
      <div className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-brand-500 animate-spin" />
    </div>
  );
}
