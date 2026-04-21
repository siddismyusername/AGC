import { useCallback, useEffect, useState } from 'react';

import { AuditEvent, getAuditEvents } from './api';

type UseAuditEventsOptions = {
  enabled?: boolean;
};

export default function useAuditEvents(
  page: number,
  pageSize: number,
  options?: UseAuditEventsOptions,
): {
  auditEvents: AuditEvent[];
  reloadAuditEvents: () => Promise<void>;
} {
  const enabled = options?.enabled ?? true;
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);

  const reloadAuditEvents = useCallback(async () => {
    if (!enabled) {
      setAuditEvents([]);
      return;
    }

    try {
      const events = await getAuditEvents(page, pageSize);
      setAuditEvents(events);
    } catch {
      setAuditEvents([]);
    }
  }, [enabled, page, pageSize]);

  useEffect(() => {
    void reloadAuditEvents();
  }, [reloadAuditEvents]);

  return { auditEvents, reloadAuditEvents };
}
