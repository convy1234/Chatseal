// controllers/instagramController.js
import fetch from "node-fetch";
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONNECTIONS_FILE = path.join(__dirname, 'instagram_connections.json');

// Store Instagram connections (use database in production)
let instagramConnections = new Map();

// Initialize connections from file
async function loadConnectionsFromFile() {
  try {
    const data = await fs.readFile(CONNECTIONS_FILE, 'utf8');
    const connectionsArray = JSON.parse(data);
    
    instagramConnections = new Map(connectionsArray);
    console.log('✅ Loaded Instagram connections from file:', instagramConnections.size);
  } catch (error) {
    console.log('📝 No existing connections file, starting fresh');
    instagramConnections = new Map();
  }
}

// Save connections to file
async function saveConnectionsToFile() {
  try {
    const connectionsArray = Array.from(instagramConnections.entries());
    await fs.writeFile(CONNECTIONS_FILE, JSON.stringify(connectionsArray, null, 2));
    console.log('💾 Saved Instagram connections to file');
  } catch (error) {
    console.error('❌ Failed to save connections to file:', error);
  }
}

// Load connections when the module starts - FIXED
let connectionsLoaded = false;

// Function to ensure connections are loaded
async function ensureConnectionsLoaded() {
  if (!connectionsLoaded) {
    await loadConnectionsFromFile();
    connectionsLoaded = true;
  }
}

// Enhanced connection management functions
export const getInstagramConnection = async (userId = 'default') => {
  await ensureConnectionsLoaded();
  
  const connectionId = `ig_${userId}`;
  const connection = instagramConnections.get(connectionId);
  
  if (connection) {
    console.log('🔍 Getting Instagram connection:', connection.ig_profile?.username);
    
    // Check if token is still valid (basic check)
    const connectionAge = Date.now() - new Date(connection.connected_at).getTime();
    const hoursOld = connectionAge / (1000 * 60 * 60);
    
    if (hoursOld > 24) {
      console.log('🕒 Connection is old, might need refresh:', hoursOld.toFixed(1) + ' hours');
    }
  } else {
    console.log('🔍 No Instagram connection found for user:', userId);
  }
  
  return connection;
};

export const setInstagramConnection = async (connection, userId = 'default') => {
  await ensureConnectionsLoaded();
  
  const connectionId = `ig_${userId}`;
  
  // Add timestamp if not present
  if (!connection.connected_at) {
    connection.connected_at = new Date().toISOString();
  }
  
  instagramConnections.set(connectionId, connection);
  console.log('✅ Instagram connection stored:', connection.ig_profile.username);
  console.log('📊 Total connections:', instagramConnections.size);
  
  // Save to file
  await saveConnectionsToFile();
  
  return connection;
};

export const clearInstagramConnection = async (userId = 'default') => {
  await ensureConnectionsLoaded();
  
  const connectionId = `ig_${userId}`;
  instagramConnections.delete(connectionId);
  console.log('🗑️ Cleared Instagram connection for user:', userId);
  await saveConnectionsToFile();
};

// Helper function for API calls - FIXED
async function makeInstagramAPI(endpoint, method = 'GET', body = null) {
  const connection = await getInstagramConnection();

  if (!connection) {
    throw new Error('Instagram not connected. Please connect your Instagram account first.');
  }

  const { ig_business_id, page_token } = connection;
  
  // Remove any existing query parameters from the endpoint
  const cleanEndpoint = endpoint.split('?')[0];
  const existingParams = endpoint.includes('?') ? endpoint.split('?')[1] : '';
  
  // Construct the URL properly
  let url = `https://graph.facebook.com/v20.0/${ig_business_id}${cleanEndpoint}`;
  
  // Add parameters correctly
  const params = new URLSearchParams();
  
  // Add existing parameters from endpoint if any
  if (existingParams) {
    const existingSearchParams = new URLSearchParams(existingParams);
    for (const [key, value] of existingSearchParams) {
      params.append(key, value);
    }
  }
  
  // Add access token as a separate parameter
  params.append('access_token', page_token);
  
  // Append all parameters to URL
  url += `?${params.toString()}`;
  
  console.log(`📸 Instagram API: ${method} ${url}`);
  
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const responseText = await response.text();
  
  let data;
  try {
    data = JSON.parse(responseText);
  } catch (parseError) {
    console.error('Failed to parse API response:', responseText);
    throw new Error('Invalid JSON response from Instagram API');
  }

  if (data.error) {
    console.error('Instagram API Error:', data.error);
    throw new Error(data.error.message || `Instagram API error: ${data.error.code}`);
  }

  return data;
}

export const startInstagramAuth = (req, res) => {
  const returnUrl = req.query.return_url || `${process.env.BASE_URL}/app/dashboard.html`;
  const redirectUri = `${process.env.BASE_URL}/api/auth/instagram/callback`;
  
  const state = JSON.stringify({ returnUrl });
  
  // Try this comprehensive scope
  const scope = 'instagram_basic,instagram_manage_messages,instagram_manage_comments,instagram_content_publish,pages_read_engagement,pages_show_list,public_profile';
  
  const authUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${process.env.FB_BUSINESS_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${encodeURIComponent(state)}&response_type=code`;
  
  console.log('📸 Instagram Auth URL:', authUrl);
  res.redirect(authUrl);
};

// Get Instagram Insights
export const getInstagramInsights = async (req, res) => {
  try {
    const connection = await getInstagramConnection();
    
    if (!connection) {
      return res.status(400).json({ error: 'Instagram not connected' });
    }

    console.log('📊 Getting Instagram insights...');

    // Try to get basic insights
    const insights = await makeInstagramAPI('/insights?metric=impressions,reach,profile_views,email_contacts,phone_call_clicks,text_message_clicks,website_clicks&period=day');
    
    if (insights.data && Array.isArray(insights.data)) {
      res.json(insights.data);
    } else if (Array.isArray(insights)) {
      res.json(insights);
    } else {
      console.log('Unexpected insights response format:', insights);
      res.json([]);
    }
  } catch (error) {
    console.error('Get insights error:', error);
    
    // Return empty array if insights aren't accessible
    if (error.message.includes('(#100)') || error.message.includes('Unsupported operation') || error.message.includes('permission')) {
      res.json([]);
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};


// Get Instagram Comments
export const getInstagramComments = async (req, res) => {
  try {
    const connection = await getInstagramConnection();
    
    if (!connection) {
      return res.status(400).json({ error: 'Instagram not connected' });
    }

    console.log('💬 Getting Instagram comments...');

    // Get recent media with their comments
    const media = await makeInstagramAPI('/media?fields=comments{username,text,timestamp,id},caption,media_type,permalink,like_count,comments_count,timestamp');
    
    // Extract and flatten all comments
    const allComments = [];
    
    if (media.data && Array.isArray(media.data)) {
      media.data.forEach(post => {
        if (post.comments && post.comments.data) {
          post.comments.data.forEach(comment => {
            allComments.push({
              id: comment.id,
              username: comment.username,
              text: comment.text,
              timestamp: comment.timestamp,
              post_id: post.id,
              post_caption: post.caption,
              post_media_type: post.media_type,
              post_permalink: post.permalink,
              post_likes: post.like_count,
              post_comments_count: post.comments_count,
              post_timestamp: post.timestamp
            });
          });
        }
      });
    }

    // Sort comments by timestamp (newest first)
    allComments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json(allComments);
    
  } catch (error) {
    console.error('Get comments error:', error);
    
    // Return empty array if comments aren't accessible
    if (error.message.includes('(#100)') || 
        error.message.includes('Unsupported operation') || 
        error.message.includes('permission') ||
        error.message.includes('(#3)') ||
        error.message.includes('capability')) {
      res.json([]);
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

export const instagramCallback = async (req, res) => {
  const { code, state, error } = req.query;
  const redirectUri = `${process.env.BASE_URL}/api/auth/instagram/callback`;

  if (error) {
    console.error('Instagram auth error:', error);
    const returnUrl = state ? JSON.parse(state).returnUrl : '/app/dashboard.html';
    return res.redirect(`${returnUrl}?instagram_auth=error&error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.status(400).send('No authorization code received');
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token?client_id=${process.env.FB_BUSINESS_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${process.env.FB_BUSINESS_APP_SECRET}&code=${code}`
    );
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      throw new Error(tokenData.error.message);
    }

    console.log('✅ Instagram User Token received');

    // Get user's pages to find connected Instagram accounts
    const pagesRes = await fetch(
      `https://graph.facebook.com/v20.0/me/accounts?fields=instagram_business_account,access_token,name&access_token=${tokenData.access_token}`
    );
    const pagesData = await pagesRes.json();

    if (pagesData.error) {
      throw new Error(pagesData.error.message);
    }

    // Find pages with Instagram Business Accounts
    const pagesWithInstagram = pagesData.data.filter(page => page.instagram_business_account);
    
    if (pagesWithInstagram.length === 0) {
      throw new Error('No Instagram Business Account found connected to your Facebook Pages');
    }

    // For now, use the first page with Instagram
    const selectedPage = pagesWithInstagram[0];
    
    // Get Instagram Business Account details
    const igRes = await fetch(
      `https://graph.facebook.com/v20.0/${selectedPage.instagram_business_account.id}?fields=username,profile_picture_url,name,biography,followers_count,follows_count,media_count&access_token=${selectedPage.access_token}`
    );
    const igData = await igRes.json();

    if (igData.error) {
      throw new Error(igData.error.message);
    }

    // Store the connection using the new setter
    const connection = {
      page_token: selectedPage.access_token,
      ig_business_id: selectedPage.instagram_business_account.id,
      page_id: selectedPage.id,
      ig_profile: igData,
      connected_at: new Date().toISOString()
    };

    await setInstagramConnection(connection); // Use the new setter with await

    console.log('✅ Instagram connected successfully:', igData.username);

    // Redirect back to dashboard with success
    const returnUrl = state ? JSON.parse(state).returnUrl : '/app/dashboard.html';
    const successUrl = `${returnUrl}?instagram_auth=success&ig_username=${encodeURIComponent(igData.username)}&ig_name=${encodeURIComponent(igData.name)}&ig_picture=${encodeURIComponent(igData.profile_picture_url)}`;
    
    res.redirect(successUrl);

  } catch (error) {
    console.error('Instagram callback error:', error);
    const returnUrl = state ? JSON.parse(state).returnUrl : '/app/dashboard.html';
    res.redirect(`${returnUrl}?instagram_auth=error&error=${encodeURIComponent(error.message)}`);
  }
};

// Get Instagram connection status - ENHANCED
export const getInstagramStatus = async (req, res) => {
  const connection = await getInstagramConnection();
  
  console.log('🔍 Checking Instagram status...');
  console.log('Available connections:', Array.from(instagramConnections.keys()));
  
  if (!connection) {
    console.log('❌ No Instagram connection found');
    return res.json({ 
      connected: false,
      message: 'Instagram not connected. Please connect your account first.'
    });
  }

  console.log('✅ Instagram connection found:', connection.ig_profile.username);
  res.json({ 
    connected: true,
    profile: connection.ig_profile
  });
};

// Get Instagram Profile
export const getInstagramProfile = async (req, res) => {
  try {
    const connection = await getInstagramConnection();
    
    if (!connection) {
      return res.status(400).json({ error: 'Instagram not connected' });
    }

    res.json(connection.ig_profile);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get Instagram Posts - FIXED
export const getInstagramPosts = async (req, res) => {
  try {
    const connection = await getInstagramConnection();
    
    if (!connection) {
      return res.status(400).json({ error: 'Instagram not connected' });
    }

    const posts = await makeInstagramAPI('/media?fields=id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count');
    
    // Handle different response formats
    if (posts.data && Array.isArray(posts.data)) {
      res.json(posts.data);
    } else if (Array.isArray(posts)) {
      res.json(posts);
    } else {
      console.log('Unexpected posts response format:', posts);
      res.json([]);
    }
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get Instagram Conversations - WITH GRACEFUL FALLBACK
export const getInstagramConversations = async (req, res) => {
  try {
    const connection = await getInstagramConnection();
    
    if (!connection) {
      return res.status(400).json({ error: 'Instagram not connected' });
    }

    // Try to get conversations
    const conversations = await makeInstagramAPI('/conversations?fields=id,participants,senders,updated_time');
    
    if (conversations.data && Array.isArray(conversations.data)) {
      res.json(conversations.data);
    } else if (Array.isArray(conversations)) {
      res.json(conversations);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Get conversations error:', error);
    
    // If permission denied, return empty array with message
    if (error.message.includes('(#3)') || 
        error.message.includes('capability') ||
        error.message.includes('permission') ||
        error.message.includes('not authorized')) {
      
      res.json({
        error: 'messaging_not_available',
        message: 'Instagram messaging is not available for this account',
        data: [] // Empty conversations array
      });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

// Create Instagram Post
export const createInstagramPost = async (req, res) => {
  try {
    const { caption, image_url } = req.body;
    
    if (!caption) {
      return res.status(400).json({ error: 'Caption is required' });
    }

    const connection = await getInstagramConnection();
    if (!connection) {
      return res.status(400).json({ error: 'Instagram not connected' });
    }

    // First create the container
    const containerData = {
      caption: caption,
      access_token: connection.page_token
    };

    if (image_url) {
      containerData.image_url = image_url;
    }

    const containerRes = await fetch(
      `https://graph.facebook.com/v20.0/${connection.ig_business_id}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(containerData)
      }
    );

    const containerResult = await containerRes.json();

    if (containerResult.error) {
      throw new Error(containerResult.error.message);
    }

    // Then publish the container
    const publishRes = await fetch(
      `https://graph.facebook.com/v20.0/${connection.ig_business_id}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: containerResult.id,
          access_token: connection.page_token
        })
      }
    );

    const publishResult = await publishRes.json();

    if (publishResult.error) {
      throw new Error(publishResult.error.message);
    }

    res.json({ success: true, id: publishResult.id });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Debug messaging capabilities
export const debugMessagingAccess = async (req, res) => {
  try {
    const connection = await getInstagramConnection();
    
    if (!connection) {
      return res.json({ error: 'Instagram not connected' });
    }

    const { ig_business_id, page_token } = connection;

    // Test 1: Basic conversations access
    console.log('🔍 Testing basic conversations access...');
    const conversationsTest = await fetch(
      `https://graph.facebook.com/v20.0/${ig_business_id}/conversations?fields=id&limit=1&access_token=${page_token}`
    );
    const convData = await conversationsTest.json();

    // Test 2: Check available fields
    console.log('🔍 Testing available fields...');
    const fieldsTest = await fetch(
      `https://graph.facebook.com/v20.0/${ig_business_id}/conversations?fields=id,participants&limit=1&access_token=${page_token}`
    );
    const fieldsData = await fieldsTest.json();

    // Test 3: Check if we can access messages
    console.log('🔍 Testing messages access...');
    let messagesTest = { success: false, data: null };
    if (convData.data && convData.data.length > 0) {
      const conversationId = convData.data[0].id;
      const messagesRes = await fetch(
        `https://graph.facebook.com/v20.0/${conversationId}?fields=messages.limit(1){id}&access_token=${page_token}`
      );
      messagesTest.data = await messagesRes.json();
      messagesTest.success = !messagesTest.data.error;
    }

    res.json({
      connection: {
        ig_business_id,
        has_token: !!page_token
      },
      tests: {
        basic_conversations: {
          success: !convData.error,
          data: convData,
          error: convData.error
        },
        fields_access: {
          success: !fieldsData.error,
          data: fieldsData,
          error: fieldsData.error
        },
        messages_access: messagesTest
      },
      required_permissions: [
        'instagram_manage_messages',
        'pages_read_engagement', 
        'pages_show_list'
      ],
      development_mode_note: 'In Development Mode, you should have access to all approved permissions for admin/developer accounts'
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Try accessing through Facebook Page
export const getPageInstagramConversations = async (req, res) => {
  try {
    const connection = await getInstagramConnection();
    
    if (!connection) {
      return res.status(400).json({ error: 'Instagram not connected' });
    }

    const { page_id, page_token } = connection;

    console.log('📸 Trying page-level Instagram conversations for page:', page_id);

    // Try to get Instagram conversations through the connected page
    const conversations = await fetch(
      `https://graph.facebook.com/v20.0/${page_id}/conversations?platform=instagram&fields=id,participants,senders,updated_time,messages{from,text,timestamp}&access_token=${page_token}`
    );

    const data = await conversations.json();
    console.log('📸 Page conversations response:', data);

    if (data.error) {
      console.error('📸 Page conversations error:', data.error);
      return res.status(403).json({ 
        error: 'page_messaging_not_available',
        message: 'Cannot access Instagram messages through Facebook Page',
        details: data.error.message
      });
    }

    res.json(data.data || []);
    
  } catch (error) {
    console.error('❌ Page conversations error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get Instagram Messages for a conversation - FIXED
export const getInstagramMessages = async (req, res) => {
  try {
    const { conversationId } = req.query;
    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID required' });
    }

    const connection = await getInstagramConnection();
    if (!connection) {
      return res.status(400).json({ error: 'Instagram not connected' });
    }

    const messages = await makeInstagramAPI(`/${conversationId}?fields=messages{from,text,timestamp}`);
    
    // Handle different response formats
    let messagesData = [];
    if (messages.messages && messages.messages.data) {
      messagesData = messages.messages.data;
    } else if (Array.isArray(messages)) {
      messagesData = messages;
    } else if (messages.data && Array.isArray(messages.data)) {
      messagesData = messages.data;
    }
    
    res.json(messagesData);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Send Instagram Message
export const sendInstagramMessage = async (req, res) => {
  try {
    const { conversationId, text } = req.body;
    
    if (!conversationId || !text) {
      return res.status(400).json({ error: 'Conversation ID and text are required' });
    }

    const result = await makeInstagramAPI(
      '/messages',
      'POST',
      {
        recipient: { id: conversationId },
        message: { text }
      }
    );

    res.json({ success: true, id: result.id });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Debug endpoint to see connections
export const debugInstagramConnections = async (req, res) => {
  await ensureConnectionsLoaded();
  const connections = Array.from(instagramConnections.entries());
  res.json({
    totalConnections: connections.length,
    connections: connections.map(([id, conn]) => ({
      id,
      ig_business_id: conn.ig_business_id,
      username: conn.ig_profile?.username,
      connected_at: conn.connected_at
    }))
  });
};

// Test all access levels
export const testMessagingAccess = async (req, res) => {
  try {
    const connection = await getInstagramConnection();
    if (!connection) {
      return res.json({ error: 'Instagram not connected' });
    }

    const { ig_business_id, page_id, page_token } = connection;

    const tests = [];

    // Test 1: Direct Instagram Business Account access
    tests.push({
      name: 'Direct Instagram API',
      url: `https://graph.facebook.com/v20.0/${ig_business_id}/conversations?fields=id&limit=1`,
      result: await testAPI(`${ig_business_id}/conversations?fields=id&limit=1`)
    });

    // Test 2: Page-level Instagram access
    tests.push({
      name: 'Page Instagram Access', 
      url: `https://graph.facebook.com/v20.0/${page_id}/conversations?platform=instagram&fields=id&limit=1`,
      result: await testAPI(`${page_id}/conversations?platform=instagram&fields=id&limit=1`, true)
    });

    // Test 3: Check if we have instagram_manage_messages permission
    const permTest = await fetch(
      `https://graph.facebook.com/v20.0/me/permissions?access_token=${page_token}`
    );
    const permData = await permTest.json();
    
    tests.push({
      name: 'Permissions Check',
      permissions: permData.data,
      has_instagram_manage_messages: permData.data.some(p => 
        p.permission === 'instagram_manage_messages' && p.status === 'granted'
      )
    });

    res.json({ tests });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

async function testAPI(endpoint, isPage = false) {
  const connection = await getInstagramConnection();
  const { page_token } = connection;
  
  try {
    const url = `https://graph.facebook.com/v20.0/${endpoint}&access_token=${page_token}`;
    const res = await fetch(url);
    const data = await res.json();
    return {
      success: !data.error,
      data: data.data ? data.data.slice(0, 2) : null, // Limit response size
      error: data.error
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Create Instagram Story
export const createInstagramStory = async (req, res) => {
  try {
    const { image_url, video_url, caption } = req.body;
    
    if (!image_url && !video_url) {
      return res.status(400).json({ error: 'Either image_url or video_url is required' });
    }

    const connection = await getInstagramConnection();
    if (!connection) {
      return res.status(400).json({ error: 'Instagram not connected' });
    }

    const { ig_business_id, page_token } = connection;

    console.log('📸 Creating Instagram story...');

    // Prepare story data
    const storyData = {
      access_token: page_token
    };

    // Add media based on type
    if (image_url) {
      storyData.image_url = image_url;
    } else if (video_url) {
      storyData.video_url = video_url;
      storyData.media_type = 'STORIES'; // Specify for videos
    }

    // Add caption if provided
    if (caption) {
      storyData.caption = caption;
    }

    console.log('📸 Story data:', { 
      has_image: !!image_url, 
      has_video: !!video_url, 
      caption_length: caption?.length || 0 
    });

    // Create story container
    const storyRes = await fetch(
      `https://graph.facebook.com/v20.0/${ig_business_id}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storyData)
      }
    );

    const storyResult = await storyRes.json();
    console.log('📸 Story container result:', storyResult);

    if (storyResult.error) {
      throw new Error(storyResult.error.message);
    }

    // Publish the story
    const publishRes = await fetch(
      `https://graph.facebook.com/v20.0/${ig_business_id}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: storyResult.id,
          access_token: page_token
        })
      }
    );

    const publishResult = await publishRes.json();
    console.log('📸 Story publish result:', publishResult);

    if (publishResult.error) {
      throw new Error(publishResult.error.message);
    }

    res.json({ 
      success: true, 
      id: publishResult.id,
      message: 'Story published successfully!'
    });
    
  } catch (error) {
    console.error('❌ Create story error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to create Instagram story'
    });
  }
};

// Get Instagram Stories (View existing stories)
export const getInstagramStories = async (req, res) => {
  try {
    const connection = await getInstagramConnection();
    
    if (!connection) {
      return res.status(400).json({ error: 'Instagram not connected' });
    }

    console.log('📸 Getting Instagram stories...');

    const stories = await makeInstagramAPI('/stories?fields=id,media_type,media_url,thumbnail_url,timestamp,permalink');

    if (stories.data && Array.isArray(stories.data)) {
      res.json(stories.data);
    } else if (Array.isArray(stories)) {
      res.json(stories);
    } else {
      console.log('Unexpected stories response format:', stories);
      res.json([]);
    }
  } catch (error) {
    console.error('Get stories error:', error);
    
    // Return empty array if stories aren't accessible
    if (error.message.includes('(#100)') || error.message.includes('Unsupported operation')) {
      res.json([]);
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

// Create Story with Mention (Advanced feature)
export const createStoryWithMention = async (req, res) => {
  try {
    const { image_url, video_url, caption, mentioned_username } = req.body;
    
    if (!image_url && !video_url) {
      return res.status(400).json({ error: 'Either image_url or video_url is required' });
    }

    const connection = await getInstagramConnection();
    if (!connection) {
      return res.status(400).json({ error: 'Instagram not connected' });
    }

    const { ig_business_id, page_token } = connection;

    // First, we need to get the user_id of the mentioned username
    let mentionedUserId = null;
    if (mentioned_username) {
      try {
        const userLookup = await fetch(
          `https://graph.facebook.com/v20.0/${ig_business_id}?fields=mentioned_comment.comment_id&access_token=${page_token}`
        );
        // Note: User ID lookup might require additional permissions
        // For now, we'll proceed without the mention if lookup fails
      } catch (lookupError) {
        console.log('User lookup failed, proceeding without mention:', lookupError.message);
      }
    }

    const storyData = {
      access_token: page_token
    };

    if (image_url) {
      storyData.image_url = image_url;
    } else if (video_url) {
      storyData.video_url = video_url;
      storyData.media_type = 'STORIES';
    }

    if (caption) {
      storyData.caption = caption;
    }

    // Create story container
    const storyRes = await fetch(
      `https://graph.facebook.com/v20.0/${ig_business_id}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storyData)
      }
    );

    const storyResult = await storyRes.json();

    if (storyResult.error) {
      throw new Error(storyResult.error.message);
    }

    // Publish the story
    const publishRes = await fetch(
      `https://graph.facebook.com/v20.0/${ig_business_id}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: storyResult.id,
          access_token: page_token
        })
      }
    );

    const publishResult = await publishRes.json();

    if (publishResult.error) {
      throw new Error(publishResult.error.message);
    }

    res.json({ 
      success: true, 
      id: publishResult.id,
      message: mentioned_username ? `Story with mention published!` : 'Story published successfully!'
    });
    
  } catch (error) {
    console.error('Create story with mention error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Initialize connections on module load (non-blocking)
loadConnectionsFromFile().then(() => {
  console.log('🚀 Instagram connections system initialized');
}).catch(error => {
  console.error('❌ Failed to initialize connections:', error);
});