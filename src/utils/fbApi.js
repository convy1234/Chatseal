import fetch from "node-fetch";

// Store page tokens
const pageTokens = new Map();

export const setPageToken = (pageId, token) => {
  pageTokens.set(pageId, token);
  console.log(`✅ Stored token for page ${pageId}`);
};

export const getPageToken = (pageId) => {
  const token = pageTokens.get(pageId);
  if (!token) {
    throw new Error(`No token found for page ${pageId}. Please authenticate with business app and select a page.`);
  }
  return token;
};

export const fetchConversations = async (pageId) => {
  const token = getPageToken(pageId);

  const res = await fetch(
    `https://graph.facebook.com/v20.0/${pageId}/conversations?fields=participants,messages{from,message,created_time}&access_token=${token}`
  );
  const data = await res.json();
  
  if (data.error) {
    throw new Error(data.error.message);
  }

  return data.data?.map(conv => ({
    id: conv.id,
    participants: conv.participants?.data || [],
    last_message: conv.messages?.data[0] || null
  })) || [];
};

export const fetchMessages = async (conversationId, pageId) => {
  const token = getPageToken(pageId);

  const res = await fetch(
    `https://graph.facebook.com/v20.0/${conversationId}?fields=messages{from,message,created_time}&access_token=${token}`
  );
  const data = await res.json();
  
  if (data.error) {
    throw new Error(data.error.message);
  }

  return data.messages?.data.map(msg => ({
    id: msg.id,
    from: msg.from,
    text: msg.message,
    created_time: msg.created_time
  })) || [];
};

export const postMessage = async (conversationId, text, pageId) => {
  const token = getPageToken(pageId);

  // First, get the participant ID from the conversation
  const convRes = await fetch(
    `https://graph.facebook.com/v20.0/${conversationId}?fields=participants&access_token=${token}`
  );
  const convData = await convRes.json();
  
  if (convData.error) {
    throw new Error(convData.error.message);
  }

  const participant = convData.participants?.data.find(p => p.id !== pageId);
  if (!participant) {
    throw new Error("Could not find participant in conversation");
  }

  const res = await fetch(`https://graph.facebook.com/v20.0/me/messages?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: participant.id },
      message: { text },
      messaging_type: "RESPONSE"
    })
  });
  
  const result = await res.json();
  
  if (result.error) {
    throw new Error(result.error.message);
  }
  
  return result;
};