'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageCircle, Send } from 'lucide-react';
import api from '@/lib/api-client';

interface ClientMessage {
  id: string;
  content: string;
  createdAt: string;
  userId: string;
  user: { firstName: string; lastName: string };
}

interface ClientConversation {
  id: string;
  client: { id: string; name: string; email: string | null };
  messages: Array<{ id: string; content: string; createdAt: string }>;
}

export default function ClientMessagesPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [message, setMessage] = useState('');

  const conversations = useQuery<ClientConversation[]>({
    queryKey: ['client-portal-conversations'],
    queryFn: () => api.get<ClientConversation[]>('/client-portal/conversations').then((response) => response.data),
  });
  const activeConversationId = selectedId || conversations.data?.[0]?.id || '';

  const messages = useQuery<ClientMessage[]>({
    queryKey: ['client-portal-staff-messages', activeConversationId],
    queryFn: () => api.get<ClientMessage[]>(`/client-portal/conversations/${activeConversationId}/messages`).then((response) => response.data),
    enabled: !!activeConversationId,
  });
  const sendMessage = useMutation({
    mutationFn: (content: string) => api.post(`/client-portal/conversations/${activeConversationId}/messages`, { content }),
    onSuccess: () => {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['client-portal-staff-messages', activeConversationId] });
      queryClient.invalidateQueries({ queryKey: ['client-portal-conversations'] });
    },
  });

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-medium text-brand-700">Client communication</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">Client messages</h1>
        <p className="mt-1 text-sm text-gray-500">Reply to client portal conversations from your team workspace.</p>
      </header>
      <div className="grid min-h-[60vh] overflow-hidden rounded-xl border border-gray-200 bg-white md:grid-cols-[280px_1fr]">
        <aside className="border-b border-gray-200 md:border-b-0 md:border-r">
          <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 font-medium text-gray-800">
            <MessageCircle className="h-4 w-4 text-brand-600" /> Conversations
          </div>
          {conversations.isLoading ? (
            <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : conversations.isError ? (
            <p className="p-4 text-sm text-rose-600">Conversations could not be loaded.</p>
          ) : (conversations.data ?? []).length === 0 ? (
            <p className="p-4 text-sm text-gray-500">Client conversations will appear here when a client starts a message.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto md:max-h-[calc(60vh-52px)]">
              {(conversations.data ?? []).map((conversation) => (
                <button
                  type="button"
                  key={conversation.id}
                  onClick={() => setSelectedId(conversation.id)}
                  className={`block w-full border-b border-gray-100 p-4 text-left hover:bg-gray-50 ${activeConversationId === conversation.id ? 'bg-brand-50' : ''}`}
                >
                  <p className="text-sm font-medium text-gray-900">{conversation.client.name}</p>
                  <p className="mt-1 truncate text-xs text-gray-500">{conversation.messages[0]?.content || 'No messages yet'}</p>
                </button>
              ))}
            </div>
          )}
        </aside>
        <section className="flex min-h-[55vh] min-w-0 flex-col">
          {activeConversationId ? (
            <>
              <div className="border-b border-gray-100 px-5 py-4">
                <h2 className="font-semibold text-gray-900">{conversations.data?.find((item) => item.id === activeConversationId)?.client.name || 'Client conversation'}</h2>
                <p className="text-xs text-gray-500">{conversations.data?.find((item) => item.id === activeConversationId)?.client.email}</p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
                {messages.isLoading && <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>}
                {messages.isError && <p className="text-sm text-rose-600">Messages could not be loaded.</p>}
                {(messages.data ?? []).map((entry) => (
                  <article key={entry.id} className="max-w-[90%] rounded-xl bg-gray-50 px-3 py-2.5">
                    <p className="mb-1 text-[11px] text-gray-500">{entry.user.firstName} {entry.user.lastName} · {new Date(entry.createdAt).toLocaleString()}</p>
                    <p className="whitespace-pre-wrap text-sm text-gray-800">{entry.content}</p>
                  </article>
                ))}
              </div>
              <form
                className="flex items-end gap-2 border-t border-gray-100 p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (message.trim()) sendMessage.mutate(message.trim());
                }}
              >
                <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={4000} rows={2} placeholder="Write a reply..." className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
                <button type="submit" disabled={!message.trim() || sendMessage.isPending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                  {sendMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send
                </button>
              </form>
              {sendMessage.isError && <p className="px-4 pb-3 text-sm text-rose-600">Reply could not be sent.</p>}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-gray-500">Select a client conversation to view messages.</div>
          )}
        </section>
      </div>
    </div>
  );
}
