"use client";

import { useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';

import { clearAuthSession, getCurrentUser, getSessionTokens } from '../lib/api';

type RouteGuardProps = {
  children: ReactNode;
};

export default function RouteGuard({ children }: RouteGuardProps) {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    async function validateSession() {
      const { accessToken, refreshToken } = getSessionTokens();
      if (!accessToken || !refreshToken) {
        clearAuthSession();
        router.replace('/login');
        return;
      }

      try {
        await getCurrentUser();
        setIsChecking(false);
      } catch {
        clearAuthSession();
        router.replace('/login');
      }
    }

    void validateSession();
  }, [router]);

  if (isChecking) {
    return (
      <main className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6 py-8 lg:px-10">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-300 backdrop-blur">
          Verifying secure session...
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
