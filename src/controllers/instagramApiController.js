// controllers/instagramApiController.js
import fetch from "node-fetch";
import { getInstagramConnection } from "./instagramController.js";

// Helper function for API calls - ENHANCED
async function makeInstagramAPI(endpoint, method = 'GET', body = null) {
  const connection = getInstagramConnection();

  if (!connection) {
    throw new Error('Instagram not connected. Please connect your Instagram account first.');
  }

  const { ig_business_id, page_token } = connection;
  const url = `https://graph.facebook.com/v20.0/${ig_business_id}${endpoint}`;
  
  console.log(`📸 Instagram API: ${method} ${url}`);
  
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${page_token}`
    }
  };

  if (body && method !== 'GET') {
    options.headers['Content-Type'] = 'application/json';
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

// Get Instagram connection status
export const getInstagramStatus = (req, res) => {
  const connection = getInstagramConnection();
  res.json({ 
    connected: !!connection,
    profile: connection ? connection.ig_profile : null
  });
};

// Get Instagram Profile
export const getInstagramProfile = async (req, res) => {
  try {
    const connection = getInstagramConnection();
    
    if (!connection) {
      return res.status(400).json({ error: 'Instagram not connected' });
    }

    res.json(connection.ig_profile);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ... rest of your Instagram API functions remain the same
export const getInstagramPosts = async (req, res) => {
  try {
    const posts = await makeInstagramAPI('/media?fields=id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count');
    res.json(posts.data || []);
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ... keep all your other Instagram API functions