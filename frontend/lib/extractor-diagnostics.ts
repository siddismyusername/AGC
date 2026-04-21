import { ExtractorDiagnosticsHistoryEntry } from './api';

function titleCaseFromSnake(input: string): string {
  return input
    .split('_')
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

export function summarizeExtractorDiagnosticsHistoryEntry(entry: ExtractorDiagnosticsHistoryEntry): string {
  const parts: string[] = [titleCaseFromSnake(entry.event)];

  if (entry.error_code) {
    parts.push(`error:${entry.error_code}`);
  }
  if (entry.provider_attempts !== null && entry.provider_attempts !== undefined) {
    parts.push(`attempts:${entry.provider_attempts}`);
  }
  if (entry.queue_backend) {
    parts.push(`queue:${entry.queue_backend}`);
  }
  if (entry.trigger) {
    parts.push(`via:${entry.trigger}`);
  }

  return parts.join(' • ');
}

export function formatExtractorDiagnosticsTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }
  return parsed.toLocaleString();
}
