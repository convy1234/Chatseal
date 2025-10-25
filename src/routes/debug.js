// routes/debug.js (or add to your whatsappRoutes for now)
import express from "express";
import axios from "axios";

const r = express.Router();

r.get("/debug/token", async (req, res) => {
  try {
    const userAccessToken = req.query.token; // pass ?token=... from your logs
    const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;

    const [mePerms, debugToken] = await Promise.all([
      axios.get("https://graph.facebook.com/v23.0/me/permissions", {
        params: { access_token: userAccessToken },
      }),
      axios.get("https://graph.facebook.com/v23.0/debug_token", {
        params: { input_token: userAccessToken, access_token: appToken },
      }),
    ]);

    res.json({
      me_permissions: mePerms.data,          // what FB granted to the *user token*
      debug_token: debugToken.data,          // contains "scopes" and "granular_scopes"
    });
  } catch (e) {
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

// routes/debug.js - Add this endpoint
r.get("/debug/env", (req, res) => {
  // Don't expose secrets in production - this is for debugging only
  res.json({
    base_url: process.env.BASE_URL,
    business_app_id: process.env.FB_BUSINESS_APP_ID ? "SET" : "MISSING",
    business_app_secret: process.env.FB_BUSINESS_APP_SECRET ? "SET" : "MISSING", 
    consumer_app_id: process.env.FB_APP_ID ? "SET" : "MISSING",
    has_page_token: process.env.FB_PAGE_ACCESS_TOKEN ? "SET" : "MISSING"
  });
});

// routes/debug.js
r.get("/debug/test-token", async (req, res) => {
  try {
    const testRes = await fetch(`https://graph.facebook.com/v20.0/me?access_token=${process.env.FB_PAGE_ACCESS_TOKEN}`);
    const testData = await testRes.json();
    
    res.json({
      token_status: testData.error ? 'EXPIRED' : 'VALID',
      error: testData.error,
      page_info: testData
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

r.get("/debug/business-auth-url", (req, res) => {
  const redirect_uri = `${process.env.BASE_URL}/api/auth/business/callback`;
  const fbAppId = process.env.FB_BUSINESS_APP_ID;
  
  const authUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${fbAppId}&redirect_uri=${encodeURIComponent(redirect_uri)}&scope=pages_messaging,pages_read_engagement`;
  
  res.json({
    business_app_id: fbAppId,
    redirect_uri: redirect_uri,
    generated_auth_url: authUrl,
    click_to_test: `<a href="${authUrl}" target="_blank">Test Business Auth</a>`
  });
});

r.get("/debug/page-info", async (req, res) => {
  try {
    const pageRes = await fetch(`https://graph.facebook.com/v20.0/me?access_token=${process.env.FB_PAGE_ACCESS_TOKEN}`);
    const pageData = await pageRes.json();
    res.json(pageData);
  } catch (error) {
    res.json({ error: error.message });
  }
});

// Add this to routes/debug.js or your existing routes
r.get("/debug/instagram-status", async (req, res) => {
  try {
    const connection = getInstagramConnection();
    console.log('🔍 Instagram Connection Debug:');
    console.log('- Connection found:', !!connection);
    console.log('- Connection details:', connection);
    
    res.json({
      connected: !!connection,
      connection_details: connection,
      total_connections: instagramConnections ? instagramConnections.size : 0
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

export default r;
