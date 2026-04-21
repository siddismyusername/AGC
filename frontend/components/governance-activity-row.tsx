import { AuditEvent, OrganizationMemberOut } from '../lib/api';
import ReviewerIdentityChips, { SessionUserLite } from './reviewer-identity-chips';

type GovernanceActivityRowProps = {
  event: AuditEvent;
  summary: string;
  sessionUser?: SessionUserLite | null;
  membersById?: Record<string, OrganizationMemberOut>;
  tone?: 'light' | 'dark';
  className?: string;
};

export function summarizeAuditEvent(event: AuditEvent): string {
  const action = event.action.replaceAll('.', ' ').replaceAll('_', ' ');
  const newValue = event.new_value ?? {};
  const oldValue = event.old_value ?? {};
  const changedKeys = Object.keys(newValue);

  if (changedKeys.length > 0) {
    const primaryKey = changedKeys[0];
    const previous = oldValue[primaryKey];
    const next = newValue[primaryKey];

    if (previous !== undefined) {
      return `Changed ${event.entity_type} ${primaryKey} from "${String(previous)}" to "${String(next)}".`;
    }

    if (changedKeys.length > 1) {
      return `${action} on ${event.entity_type} (${changedKeys.length} fields updated).`;
    }

    return `Set ${event.entity_type} ${primaryKey} to "${String(next)}".`;
  }

  return `${action} on ${event.entity_type}.`;
}

export default function GovernanceActivityRow({
  event,
  summary,
  sessionUser,
  membersById,
  tone = 'dark',
  className,
}: GovernanceActivityRowProps) {
  const timestampClassName = tone === 'dark' ? 'text-[11px] text-slate-400' : 'text-[11px] text-slate-500';

  return (
    <div className={className ?? 'rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300'}>
      <p>{summary}</p>
      <p className={`mt-1 ${timestampClassName}`}>{new Date(event.created_at).toLocaleString()}</p>
      <ReviewerIdentityChips
        reviewerId={event.user_id}
        reviewerEmail={event.user_email}
        sessionUser={sessionUser}
        membersById={membersById}
        tone={tone}
        className="mt-1 flex items-center gap-1.5"
      />
    </div>
  );
}
