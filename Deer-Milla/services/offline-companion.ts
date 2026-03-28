function quoteMessage(message: string): string {
  const trimmedMessage = message.trim();
  return trimmedMessage.length > 120
    ? `${trimmedMessage.slice(0, 117)}...`
    : trimmedMessage;
}

export function generateOfflineCompanionResponse(message: string): string {
  const normalizedMessage = message.toLowerCase();

  if (/\b(hi|hello|hey|good morning|good evening)\b/.test(normalizedMessage)) {
    return "I'm offline right now, but I'm still here with you. If you want, keep talking and I'll stay present until your full link comes back.";
  }

  if (/\b(weather|news|email|calendar|youtube|search|map|route|navigate)\b/.test(normalizedMessage)) {
    return "I'm in offline mode, so I can't reach live services for that request right now. I can still help you think it through, draft what you need, or hold the thread until you're back online.";
  }

  if (/\b(help|what can you do|status)\b/.test(normalizedMessage)) {
    return 'Right now I am in offline fallback mode. I can keep the conversation going locally, hold onto your intent, and help you draft the next step until the remote server or on-device model is available.';
  }

  return `I'm in offline fallback mode, so I can't reach your full Milla stack right now. I did catch: "${quoteMessage(message)}". Keep talking — I can stay with you locally until the remote link or device model is ready.`;
}
