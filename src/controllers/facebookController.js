// controllers/facebookController.js
import fetch from "node-fetch";
// at top of file
import fs from 'fs';

// Consumer App Auth (for user login)
export const startFacebookAuth = (req, res) => {
  const redirect_uri = `${process.env.BASE_URL}/api/auth/facebook/callback`;
  const fbAppId = process.env.FB_APP_ID; // Consumer app ID
  const fbAuthUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${fbAppId}&redirect_uri=${encodeURIComponent(redirect_uri)}&scope=public_profile,email`;
  res.redirect(fbAuthUrl);
};

export const facebookCallback = async (req, res) => {
  const { code } = req.query;
  const redirect_uri = `${process.env.BASE_URL}/api/auth/facebook/callback`;

  if (!code) return res.status(400).send("Missing authorization code.");

  try {
    // Exchange code for access token using CONSUMER app
    const tokenRes = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token?client_id=${process.env.FB_APP_ID}&redirect_uri=${encodeURIComponent(
        redirect_uri
      )}&client_secret=${process.env.FB_APP_SECRET}&code=${code}`
    );
    const tokenData = await tokenRes.json();

    // Fetch user info
    const userRes = await fetch(`https://graph.facebook.com/me?fields=id,name,picture&access_token=${tokenData.access_token}`);
    const userData = await userRes.json();

    console.log("✅ Facebook User:", userData);

    // Redirect to dashboard with user data
    const redirectTo = `/app/dashboard.html?name=${encodeURIComponent(userData.name)}&picture=${encodeURIComponent(userData.picture.data.url)}&user_id=${userData.id}`;
    res.redirect(redirectTo);

  } catch (error) {
    console.error("Facebook callback error:", error);
    res.status(500).send("Facebook login failed.");
  }
};

// Business App Auth (for page access)
export const startBusinessAuth = (req, res) => {
  const redirect_uri = `${process.env.BASE_URL}/api/auth/business/callback`;
  const fbAppId = process.env.FB_BUSINESS_APP_ID;
  
  // Request page permissions for Messenger API
  const scope = 'pages_messaging,pages_read_engagement,pages_manage_metadata,business_management';
  
  const fbAuthUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${fbAppId}&redirect_uri=${encodeURIComponent(redirect_uri)}&scope=${scope}&auth_type=rerequest`;
  res.redirect(fbAuthUrl);
};

export const businessCallback = async (req, res) => {
  const { code } = req.query;
  const redirect_uri = `${process.env.BASE_URL}/api/auth/business/callback`;

  if (!code) return res.status(400).send("Missing authorization code.");

  try {
    // Exchange code for access token using BUSINESS app
    const tokenRes = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token?client_id=${process.env.FB_BUSINESS_APP_ID}&redirect_uri=${encodeURIComponent(
        redirect_uri
      )}&client_secret=${process.env.FB_BUSINESS_APP_SECRET}&code=${code}`
    );
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error("Token error:", tokenData.error);
      return res.status(400).send("Business app authentication failed.");
    }

    // Get user's pages with the business app token
    const pagesRes = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,picture,perms&access_token=${tokenData.access_token}`);
    const pagesData = await pagesRes.json();

    console.log("📄 Business Pages:", pagesData);

    // Return pages data to frontend
    res.redirect(`/app/dashboard.html?business_auth=success&pages=${encodeURIComponent(JSON.stringify(pagesData.data || []))}`);

  } catch (error) {
    console.error("Business callback error:", error);
    res.status(500).send("Business app authentication failed.");
  }
};


const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const PAGE_ID = "849835128210022"; // Your Facebook Page ID

// Get Facebook Posts
export const getFacebookPosts = async (req, res) => {
  try {
    console.log('📝 Fetching Facebook posts...');
    
    const response = await fetch(
      `https://graph.facebook.com/v20.0/${PAGE_ID}/posts?fields=id,message,created_time,likes.limit(1).summary(true),comments.limit(1).summary(true)&access_token=${PAGE_ACCESS_TOKEN}`
    );
    
    const responseText = await response.text();
    const data = JSON.parse(responseText);
    
    console.log('📝 Facebook Posts API response:', data);
    
    if (data.error) {
      throw new Error(data.error.message);
    }

    const posts = data.data?.map(post => ({
      id: post.id,
      message: post.message,
      created_time: post.created_time,
      likes: post.likes?.summary?.total_count || 0,
      comments: post.comments?.summary?.total_count || 0
    })) || [];

    console.log(`✅ Loaded ${posts.length} Facebook posts`);
    res.json(posts);
    
  } catch (err) {
    console.error("Get Facebook posts error:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get Facebook Comments
export const getFacebookComments = async (req, res) => {
  try {
    console.log('💭 Fetching Facebook comments...');
    
    // First get recent posts
    const postsResponse = await fetch(
      `https://graph.facebook.com/v20.0/${PAGE_ID}/posts?fields=id&limit=5&access_token=${PAGE_ACCESS_TOKEN}`
    );
    const postsData = await postsResponse.json();
    
    let allComments = [];
    
    // Get comments for each post
    for (const post of postsData.data || []) {
      const commentsResponse = await fetch(
        `https://graph.facebook.com/v20.0/${post.id}/comments?fields=id,message,from,created_time&access_token=${PAGE_ACCESS_TOKEN}`
      );
      const commentsData = await commentsResponse.json();
      
      const postComments = commentsData.data?.map(comment => ({
        id: comment.id,
        message: comment.message,
        from: comment.from,
        created_time: comment.created_time,
        post_id: post.id
      })) || [];
      
      allComments = [...allComments, ...postComments];
    }
    
    // Sort by most recent
    allComments.sort((a, b) => new Date(b.created_time) - new Date(a.created_time));
    
    console.log(`✅ Loaded ${allComments.length} Facebook comments`);
    res.json(allComments.slice(0, 20)); // Return top 20 comments
    
  } catch (err) {
    console.error("Get Facebook comments error:", err);
    res.status(500).json({ error: err.message });
  }
};

// Create Facebook Post
export const createFacebookPost = async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    console.log('➕ Creating Facebook post:', message);
    
    const response = await fetch(
      `https://graph.facebook.com/v20.0/${PAGE_ID}/feed`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message,
          access_token: PAGE_ACCESS_TOKEN
        })
      }
    );
    
    const responseText = await response.text();
    const data = JSON.parse(responseText);
    
    console.log('➕ Create Post API response:', data);
    
    if (data.error) {
      throw new Error(data.error.message);
    }

    console.log('✅ Facebook post created successfully');
    res.json({ success: true, data: data });
    
  } catch (err) {
    console.error("Create Facebook post error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Reply to Comment
export const replyToComment = async (req, res) => {
  try {
    const { commentId, message } = req.body;
    
    if (!commentId || !message) {
      return res.status(400).json({ error: "Comment ID and message are required" });
    }

    console.log('💬 Replying to comment:', commentId, message);
    
    const response = await fetch(
      `https://graph.facebook.com/v20.0/${commentId}/comments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message,
          access_token: PAGE_ACCESS_TOKEN
        })
      }
    );
    
    const responseText = await response.text();
    const data = JSON.parse(responseText);
    
    console.log('💬 Reply to comment API response:', data);
    
    if (data.error) {
      throw new Error(data.error.message);
    }

    console.log('✅ Reply posted successfully');
    res.json({ success: true, data: data });
    
  } catch (err) {
    console.error("Reply to comment error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};




// Helper: check env tokens
export const getFacebookStatus = (req, res) => {
  // Determine live mode by presence of page token / business app id
  const live = !!(process.env.FB_PAGE_ACCESS_TOKEN && process.env.FB_BUSINESS_APP_ID && process.env.FB_BUSINESS_APP_SECRET);
  res.json({ live });
};

// ---- MOCK data handlers ----
const now = () => new Date().toISOString();

export const getMockConversations = (req, res) => {
  const convs = [
    { id: 'conv_1', sender_name: 'Ada (Customer)', snippet: 'Hi, is the store open today?' },
    { id: 'conv_2', sender_name: 'Tunde (Support)', snippet: 'Thanks for the update!' },
    { id: 'conv_3', sender_name: 'Chinelo', snippet: 'Can I get a refund?' }
  ];
  res.json(convs);
};

export const getMockConversationMessages = (req, res) => {
  const { id } = req.params;
  const messages = [
    { id: 'm1', from_name: 'Ada (Customer)', from_me: false, text: 'Hi, is the store open today?', created_time: now() },
    { id: 'm2', from_name: 'You (demo)', from_me: true, text: 'Yes — we open at 9am. How can we help?', created_time: now() }
  ];
  res.json(messages);
};

export const getMockPosts = (req, res) => {
  const posts = [
    { id: 'p_1', message: 'Storefront launch — 25% off today!', created_time: now(), likes: 24, comments: 4 },
    { id: 'p_2', message: 'New juice flavors available 🎉', created_time: now(), likes: 14, comments: 2 }
  ];
  res.json(posts);
};

export const getMockComments = (req, res) => {
  const comments = [
    { id: 'c_1', message: 'Love this!', from: { name: 'Efosa' }, created_time: now(), post_id: 'p_1' },
    { id: 'c_2', message: 'How much is delivery?', from: { name: 'Aisha' }, created_time: now(), post_id: 'p_1' }
  ];
  res.json(comments);
};

// If you already had getFacebookPosts/getFacebookComments etc - keep them as-is for live calls.
// For new live-conversation endpoints you can implement similar to comments/posts but using Graph APIs:
// getConversations, getConversationMessages, replyMessage etc. For now we show mock versions:

export const getConversations = async (req, res) => {
  // If no FB token available respond with 400
  if (!process.env.FB_PAGE_ACCESS_TOKEN) {
    return res.status(400).json({ error: 'No PAGE access token configured' });
  }
  // Implement live retrieval here when approved...
  res.status(501).json({ error: 'Not implemented in this demo - use mock' });
};

// controllers/facebookController.js

export const getConversationMessages = async (req, res) => {
  const { id } = req.params;

  // If no PAGE token configured, return mock conversation messages
  if (!process.env.FB_PAGE_ACCESS_TOKEN) {
    console.log(`No PAGE token configured — returning mock messages for conversation ${id}`);
    const now = () => new Date().toISOString();
    const messages = [
      { id: `${id}_m1`, from_name: 'Ada (Customer)', from_me: false, text: 'Hi, is the store open today?', created_time: now() },
      { id: `${id}_m2`, from_name: 'You (demo)', from_me: true, text: 'Yes — we open at 9am. How can we help?', created_time: now() },
      { id: `${id}_m3`, from_name: 'Ada (Customer)', from_me: false, text: 'Great! I will drop by around 10am.', created_time: now() }
    ];
    return res.json(messages);
  }

  // If token exists but you haven't implemented the live logic yet, respond clearly
  try {
    // Implement real Graph API logic here when ready.
    res.status(501).json({ error: 'Conversation messages retrieval not implemented yet' });
  } catch (err) {
    console.error('getConversationMessages error:', err);
    res.status(500).json({ error: err.message });
  }
};


export const replyMessage = async (req, res) => {
  if (!process.env.FB_PAGE_ACCESS_TOKEN) {
    return res.status(400).json({ error: 'No PAGE access token configured' });
  }
  res.status(501).json({ error: 'Not implemented in this demo - use mock' });
};
