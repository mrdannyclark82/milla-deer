import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail, RefreshCw, Search, Send, Loader2, Inbox } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/queryClient';

interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  preview: string;
  date: string;
  isRead: boolean;
  isStarred?: boolean;
}

interface EmailDetail extends EmailSummary {
  to?: string;
  cc?: string;
  bodyText?: string;
  bodyHtml?: string;
}

interface GmailRecentResponse {
  success: boolean;
  message?: string;
  emails: EmailSummary[];
  error?: string;
}

interface GmailContentResponse {
  success: boolean;
  email: EmailDetail | null;
  error?: string;
}

export function GmailClient() {
  const [search, setSearch] = useState('');
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const recentEmailsQuery = useQuery<GmailRecentResponse>({
    queryKey: ['/api/gmail/recent', 10],
    queryFn: () => apiRequest('/gmail/recent?maxResults=10'),
    refetchInterval: 30000,
  });

  const emails = recentEmailsQuery.data?.emails || [];
  const filteredEmails = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return emails;

    return emails.filter((email) =>
      [email.from, email.subject, email.preview].some((field) =>
        field.toLowerCase().includes(needle)
      )
    );
  }, [emails, search]);

  const selectedEmailQuery = useQuery<GmailContentResponse>({
    queryKey: ['/api/gmail/content', selectedEmailId],
    queryFn: () => apiRequest(`/gmail/content?messageId=${selectedEmailId}`),
    enabled: Boolean(selectedEmailId),
  });

  const selectedEmail = selectedEmailQuery.data?.email || null;

  const sendEmail = async () => {
    if (!composeTo.trim() || !composeSubject.trim() || !composeBody.trim()) {
      setSendStatus('Fill out the To, subject, and body fields first.');
      return;
    }

    try {
      setIsSending(true);
      setSendStatus(null);
      const result = await apiRequest<{ message?: string; success: boolean }>(
        '/gmail/send',
        {
          method: 'POST',
          body: JSON.stringify({
            to: composeTo.trim(),
            subject: composeSubject.trim(),
            body: composeBody.trim(),
          }),
        }
      );

      setComposeTo('');
      setComposeSubject('');
      setComposeBody('');
      setSendStatus(result.message || 'Email sent.');
      await recentEmailsQuery.refetch();
    } catch (error) {
      setSendStatus(
        error instanceof Error ? error.message : 'Failed to send email.'
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card className="bg-black/40 backdrop-blur-lg border border-white/10 h-full flex flex-col">
      <CardHeader className="border-b border-white/10 pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <Mail className="w-5 h-5 text-red-400" />
            Gmail
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/60 hover:text-white"
            onClick={() => recentEmailsQuery.refetch()}
          >
            <RefreshCw
              className={`w-4 h-4 ${
                recentEmailsQuery.isFetching ? 'animate-spin' : ''
              }`}
            />
          </Button>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <Input
            placeholder="Search the latest 10 emails..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-white/5 border-white/10 pl-9 text-sm text-white placeholder:text-white/30 h-9"
          />
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <div className="grid h-full lg:grid-cols-[320px_1fr]">
          <div className="border-r border-white/10">
            <div className="flex items-center justify-between px-4 py-3 text-xs text-white/50 border-b border-white/5">
              <span className="flex items-center gap-2">
                <Inbox className="w-4 h-4 text-red-300" />
                Latest 10 emails
              </span>
              <span>{emails.filter((email) => !email.isRead).length} unread</span>
            </div>
            <ScrollArea className="h-[520px]">
              <div className="divide-y divide-white/5">
                {recentEmailsQuery.isLoading ? (
                  <div className="flex justify-center p-6">
                    <Loader2 className="w-5 h-5 animate-spin text-white/40" />
                  </div>
                ) : filteredEmails.length === 0 ? (
                  <div className="p-6 text-sm text-white/45">
                    {recentEmailsQuery.data?.error ||
                      'No synced emails are available right now.'}
                  </div>
                ) : (
                  filteredEmails.map((email) => (
                    <button
                      key={email.id}
                      onClick={() => setSelectedEmailId(email.id)}
                      className={`w-full text-left p-4 hover:bg-white/5 transition-colors ${
                        selectedEmailId === email.id ? 'bg-white/10' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span
                          className={`text-sm truncate ${
                            email.isRead ? 'text-white/70' : 'font-semibold text-white'
                          }`}
                        >
                          {email.from}
                        </span>
                        <span className="text-[11px] text-white/40 flex-shrink-0">
                          {email.date}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-white truncate">
                        {email.subject}
                      </div>
                      <div className="mt-1 text-xs text-white/40 line-clamp-2">
                        {email.preview}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="grid h-full lg:grid-rows-[1fr_auto]">
            <div className="min-h-0 border-b border-white/10">
              <div className="px-4 py-3 border-b border-white/5">
                <h4 className="text-sm font-medium text-white">Selected email</h4>
              </div>
              <ScrollArea className="h-[300px] px-4 py-4">
                {selectedEmailId ? (
                  selectedEmailQuery.isLoading ? (
                    <div className="flex justify-center p-6">
                      <Loader2 className="w-5 h-5 animate-spin text-white/40" />
                    </div>
                  ) : selectedEmail ? (
                    <div className="space-y-4">
                      <div>
                        <div className="text-lg font-semibold text-white">
                          {selectedEmail.subject}
                        </div>
                        <div className="mt-2 text-xs text-white/50">
                          From: {selectedEmail.from}
                        </div>
                        {selectedEmail.to && (
                          <div className="mt-1 text-xs text-white/50">
                            To: {selectedEmail.to}
                          </div>
                        )}
                        <div className="mt-1 text-xs text-white/40">
                          {selectedEmail.date}
                        </div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/80 whitespace-pre-wrap">
                        {selectedEmail.bodyText || selectedEmail.preview}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-white/45">
                      {selectedEmailQuery.data?.error || 'Unable to load email.'}
                    </div>
                  )
                ) : (
                  <div className="text-sm text-white/45">
                    Select an email to view it.
                  </div>
                )}
              </ScrollArea>
            </div>

            <div className="p-4 space-y-3">
              <div className="text-sm font-medium text-white">Quick compose</div>
              <div className="grid gap-2">
                <Input
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="To"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
                <Input
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Subject"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
                <textarea
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="Write your email..."
                  rows={4}
                  className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-white/45">{sendStatus || ''}</span>
                <Button
                  onClick={sendEmail}
                  disabled={isSending}
                  className="bg-red-500/20 text-red-200 hover:bg-red-500/30"
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Send
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
