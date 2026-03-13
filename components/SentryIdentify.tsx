"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export function SentryIdentify({
  userId,
  email,
}: {
  userId: string;
  email?: string;
}) {
  useEffect(() => {
    Sentry.setUser({ id: userId, email });
    return () => {
      Sentry.setUser(null);
    };
  }, [userId, email]);

  return null;
}
