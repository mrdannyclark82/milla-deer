import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiRequest } from '@/lib/queryClient';

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end?: string;
  htmlLink?: string;
}

interface CalendarEventsResponse {
  success: boolean;
  events: CalendarEvent[];
  error?: string;
}

type CalendarViewMode = 'day' | 'week' | 'month';

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function endOfWeek(date: Date) {
  const next = startOfWeek(date);
  next.setDate(next.getDate() + 6);
  return endOfDay(next);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function formatEventTime(event: CalendarEvent) {
  const start = new Date(event.start);
  const hasExplicitTime = event.start.includes('T');
  return hasExplicitTime
    ? start.toLocaleString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : start.toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
}

export function GoogleCalendarCard() {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<CalendarViewMode>('day');
  const [referenceDate, setReferenceDate] = useState(() => new Date());

  const { timeMin, timeMax, rangeLabel, maxResults } = useMemo(() => {
    if (viewMode === 'week') {
      const min = startOfWeek(referenceDate);
      const max = endOfWeek(referenceDate);
      return {
        timeMin: min,
        timeMax: max,
        maxResults: 50,
        rangeLabel: `${min.toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
        })} - ${max.toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
        })}`,
      };
    }

    if (viewMode === 'month') {
      const min = startOfMonth(referenceDate);
      const max = endOfMonth(referenceDate);
      return {
        timeMin: min,
        timeMax: max,
        maxResults: 100,
        rangeLabel: min.toLocaleDateString([], {
          month: 'long',
          year: 'numeric',
        }),
      };
    }

    const min = startOfDay(referenceDate);
    const max = endOfDay(referenceDate);
    return {
      timeMin: min,
      timeMax: max,
      maxResults: 20,
      rangeLabel: min.toLocaleDateString([], {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }),
    };
  }, [referenceDate, viewMode]);

  const eventsQuery = useQuery<CalendarEventsResponse>({
    queryKey: [
      '/api/calendar/events',
      viewMode,
      timeMin.toISOString(),
      timeMax.toISOString(),
      maxResults,
    ],
    queryFn: () =>
      apiRequest(
        `/calendar/events?maxResults=${maxResults}&timeMin=${encodeURIComponent(
          timeMin.toISOString()
        )}&timeMax=${encodeURIComponent(timeMax.toISOString())}`
      ),
    refetchInterval: 30000,
  });

  const shiftRange = (direction: -1 | 1) => {
    setReferenceDate((current) => {
      const next = new Date(current);
      if (viewMode === 'month') {
        next.setMonth(next.getMonth() + direction);
      } else if (viewMode === 'week') {
        next.setDate(next.getDate() + direction * 7);
      } else {
        next.setDate(next.getDate() + direction);
      }
      return next;
    });
  };

  const createEvent = async () => {
    if (!title.trim() || !date.trim()) {
      setStatus('Enter a title and date first.');
      return;
    }

    try {
      setIsSaving(true);
      setStatus(null);
      const response = await apiRequest<{ success: boolean; message?: string }>(
        '/calendar/events',
        {
          method: 'POST',
          body: JSON.stringify({
            title: title.trim(),
            date: date.trim(),
            time: time.trim() || undefined,
          }),
        }
      );
      setTitle('');
      setDate('');
      setTime('');
      setStatus(response.message || 'Event added.');
      await eventsQuery.refetch();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'Failed to add event.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="bg-black/40 backdrop-blur-lg border border-white/10 h-full flex flex-col">
      <CardHeader className="border-b border-white/10 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-emerald-400" />
            Google Calendar
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/60 hover:text-white"
              onClick={() => eventsQuery.refetch()}
            >
              <RefreshCw
                className={`w-4 h-4 ${eventsQuery.isFetching ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-1">
            {(['day', 'week', 'month'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${
                  viewMode === mode
                    ? 'bg-emerald-500/20 text-emerald-200'
                    : 'text-white/55 hover:text-white'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-white/65">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/60 hover:text-white"
              onClick={() => shiftRange(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              onClick={() => setReferenceDate(new Date())}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/10"
            >
              {rangeLabel}
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/60 hover:text-white"
              onClick={() => shiftRange(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden pt-4">
        <div className="grid h-full gap-4 grid-rows-[1fr_auto]">
          <ScrollArea className="h-[270px] pr-2">
            <div className="space-y-2">
              {eventsQuery.isLoading ? (
                <div className="flex justify-center p-6">
                  <Loader2 className="w-5 h-5 animate-spin text-white/40" />
                </div>
              ) : eventsQuery.data?.events?.length ? (
                eventsQuery.data.events.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-lg border border-white/10 bg-white/5 p-3"
                  >
                    <div className="text-sm font-medium text-white">
                      {event.summary}
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      {formatEventTime(event)}
                    </div>
                    {event.location && (
                      <div className="mt-1 text-xs text-white/40">
                        {event.location}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-sm text-white/45">
                  {eventsQuery.data?.error ||
                    `No events are synced for this ${viewMode} right now.`}
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="space-y-2">
            <div className="text-sm font-medium text-white">Quick add</div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="tomorrow or 2026-03-17"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
              <Input
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="3pm"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-white/45">{status || ''}</span>
              <Button
                onClick={createEvent}
                disabled={isSaving}
                className="bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Add
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
