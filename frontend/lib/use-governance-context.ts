import { useEffect, useState } from 'react';

import { getOrganizationMembers, OrganizationMemberOut, USER_KEY } from './api';
import { SessionUserLite } from '../components/reviewer-identity-chips';

export default function useGovernanceContext(): {
  sessionUser: SessionUserLite | null;
  organizationMembersById: Record<string, OrganizationMemberOut>;
} {
  const [sessionUser, setSessionUser] = useState<SessionUserLite | null>(null);
  const [organizationMembersById, setOrganizationMembersById] = useState<Record<string, OrganizationMemberOut>>({});

  useEffect(() => {
    try {
      const serializedUser = localStorage.getItem(USER_KEY);
      if (!serializedUser) {
        setSessionUser(null);
        return;
      }

      const parsedUser = JSON.parse(serializedUser) as Record<string, unknown>;
      const id = typeof parsedUser.id === 'string' ? parsedUser.id : '';
      const fullName = typeof parsedUser.full_name === 'string' ? parsedUser.full_name : '';
      const email = typeof parsedUser.email === 'string' ? parsedUser.email : '';

      if (!id) {
        setSessionUser(null);
        return;
      }

      setSessionUser({ id, full_name: fullName, email });
    } catch {
      setSessionUser(null);
    }
  }, []);

  useEffect(() => {
    async function loadOrganizationMembers() {
      try {
        const members = await getOrganizationMembers();
        const memberMap: Record<string, OrganizationMemberOut> = {};
        for (const member of members) {
          memberMap[member.id] = member;
        }
        setOrganizationMembersById(memberMap);
      } catch {
        setOrganizationMembersById({});
      }
    }

    void loadOrganizationMembers();
  }, []);

  return { sessionUser, organizationMembersById };
}
