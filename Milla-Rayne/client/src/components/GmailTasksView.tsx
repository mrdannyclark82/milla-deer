import { GmailClient } from './GmailClient';
import { GoogleCalendarCard } from './GoogleCalendarCard';
import { PersonalTasksPanel } from './PersonalTasksPanel';

export function GmailTasksView() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] h-[640px]">
      <GmailClient />
      <div className="grid gap-6 grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
        <GoogleCalendarCard />
        <PersonalTasksPanel />
      </div>
    </div>
  );
}
