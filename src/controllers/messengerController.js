// controllers/messengerController.js
import fetch from "node-fetch";

const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const PAGE_ID = "849835128210022"; // Your actual Page ID

export const getConversations = async (req, res) => {
  try {
    console.log('🔍 Fetching conversations for page:', PAGE_ID);
    
    const response = await fetch(
      `https://graph.facebook.com/v20.0/${PAGE_ID}/conversations?fields=participants,messages{from,message,created_time}&access_token=${PAGE_ACCESS_TOKEN}`
    );
    
    // Read the response body once and store it
    const responseText = await response.text();
    const data = JSON.parse(responseText);
    
    console.log('📨 Conversations API response:', data);
    
    if (data.error) {
      throw new Error(data.error.message);
    }

    const conversations = data.data?.map(conv => ({
      id: conv.id,
      participants: conv.participants?.data || [],
      last_message: conv.messages?.data[0] || null
    })) || [];

    console.log(`✅ Loaded ${conversations.length} conversations`);
    res.json(conversations);
    
  } catch (err) {
    console.error("Get conversations error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getMessages = async (req, res) => {
  const { conversationId } = req.query;
  
  try {
    if (!conversationId) {
      return res.status(400).json({ error: "Conversation ID required" });
    }

    console.log('🔍 Fetching messages for conversation:', conversationId);
    
    const response = await fetch(
      `https://graph.facebook.com/v20.0/${conversationId}?fields=messages{from,message,created_time}&access_token=${PAGE_ACCESS_TOKEN}`
    );
    
    // Read the response body once and store it
    const responseText = await response.text();
    const data = JSON.parse(responseText);
    
    console.log('📨 Messages API response:', data);
    
    if (data.error) {
      throw new Error(data.error.message);
    }

    const messages = data.messages?.data.map(msg => ({
      id: msg.id,
      from: msg.from,
      text: msg.message,
      created_time: msg.created_time
    })) || [];

    console.log(`✅ Loaded ${messages.length} messages`);
    res.json(messages);
    
  } catch (err) {
    console.error("Get messages error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const sendMessage = async (req, res) => {
  const { conversationId, text } = req.body;
  
  try {
    if (!conversationId || !text) {
      return res.status(400).json({ error: "Conversation ID and text required" });
    }

    console.log('💬 Sending message to conversation:', conversationId);
    
    // Get participant from conversation
    const convResponse = await fetch(
      `https://graph.facebook.com/v20.0/${conversationId}?fields=participants&access_token=${PAGE_ACCESS_TOKEN}`
    );
    
    const convResponseText = await convResponse.text();
    const convData = JSON.parse(convResponseText);
    
    if (convData.error) {
      throw new Error(convData.error.message);
    }

    const participant = convData.participants?.data.find(p => p.id !== PAGE_ID);
    if (!participant) {
      throw new Error("Could not find participant in conversation");
    }

    console.log('👤 Found participant:', participant.id);
    
    // Send message
    const msgResponse = await fetch(`https://graph.facebook.com/v20.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: participant.id },
        message: { text },
        messaging_type: "RESPONSE"
      })
    });
    
    const msgResponseText = await msgResponse.text();
    const result = JSON.parse(msgResponseText);
    
    if (result.error) {
      throw new Error(result.error.message);
    }
    
    console.log('✅ Message sent successfully');
    res.json({ success: true, data: result });
    
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};