import { OrganizationMemberOut } from '../lib/api';

export type SessionUserLite = {
  id: string;
  full_name: string;
  email: string;
};

type ReviewerIdentityChipsProps = {
  reviewerId?: string | null;
  reviewerEmail?: string | null;
  sessionUser?: SessionUserLite | null;
  membersById?: Record<string, OrganizationMemberOut>;
  tone?: 'light' | 'dark';
  className?: string;
};

export function resolveReviewerPresentation({
  reviewerId,
  reviewerEmail,
  sessionUser,
  membersById,
}: {
  reviewerId?: string | null;
  reviewerEmail?: string | null;
  sessionUser?: SessionUserLite | null;
  membersById?: Record<string, OrganizationMemberOut>;
}): {
  label: string;
  role: string | null;
  isActive: boolean | null;
} {
  const normalizedId = (reviewerId ?? '').trim();

  if (!normalizedId) {
    return {
      label: reviewerEmail?.trim() || 'Unknown reviewer',
      role: null,
      isActive: null,
    };
  }

  if (sessionUser && normalizedId === sessionUser.id) {
    const label = sessionUser.full_name || sessionUser.email || 'You';
    const ownMember = membersById?.[normalizedId];
    return {
      label,
      role: ownMember?.role ?? null,
      isActive: typeof ownMember?.is_active === 'boolean' ? ownMember.is_active : null,
    };
  }

  const member = membersById?.[normalizedId];
  if (member) {
    return {
      label: member.full_name || member.email,
      role: member.role ?? null,
      isActive: typeof member.is_active === 'boolean' ? member.is_active : null,
    };
  }

  if (reviewerEmail?.trim()) {
    return {
      label: reviewerEmail.trim(),
      role: null,
      isActive: null,
    };
  }

  return {
    label: `User ${normalizedId.slice(0, 8)}...`,
    role: null,
    isActive: null,
  };
}

export default function ReviewerIdentityChips({
  reviewerId,
  reviewerEmail,
  sessionUser,
  membersById,
  tone = 'light',
  className,
}: ReviewerIdentityChipsProps) {
  const reviewer = resolveReviewerPresentation({
    reviewerId,
    reviewerEmail,
    sessionUser,
    membersById,
  });

  const labelClassName = tone === 'dark'
    ? 'rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-slate-100'
    : 'rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700';
  const roleClassName = tone === 'dark'
    ? 'rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-200'
    : 'rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-700';

  return (
    <div className={className ?? 'flex items-center gap-1.5'}>
      <span className={labelClassName}>{reviewer.label}</span>
      {reviewer.role ? (
        <span className={roleClassName}>{reviewer.role}</span>
      ) : null}
      {reviewer.isActive !== null ? (
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${reviewer.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}
        >
          {reviewer.isActive ? 'active' : 'inactive'}
        </span>
      ) : null}
    </div>
  );
}
