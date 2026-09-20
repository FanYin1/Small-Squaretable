/**
 * DateTime composable
 *
 * Provides date/time formatting utilities
 */

export function useDateTime() {
  const formatRelativeTime = (date: string | Date): string => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 30) return `${diffDay}d ago`;
    return d.toLocaleDateString();
  };

  const formatTime = (date: string | Date): string => {
    const d = new Date(date);
    return d.toLocaleTimeString();
  };

  return {
    formatRelativeTime,
    formatTime,
  };
}
