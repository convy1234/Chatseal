// routes/instagram.js
import express from 'express';
import { 
  startInstagramAuth, 
  instagramCallback,
  getInstagramStatus,
  getInstagramProfile,
  getInstagramPosts,
  getInstagramConversations,
  getInstagramMessages,
  sendInstagramMessage,
  debugMessagingAccess,
  getPageInstagramConversations,
  createInstagramPost,
  testMessagingAccess,
  debugInstagramConnections,
  createInstagramStory,
  getInstagramStories,
  createStoryWithMention,
  clearInstagramConnection,
  setInstagramConnection,
  getInstagramConnection,
  getInstagramInsights
  , getInstagramComments
} from '../controllers/instagramController.js';

const router = express.Router();

// Auth routes
router.get('/auth/instagram/start', startInstagramAuth);
router.get('/auth/instagram/callback', instagramCallback);

// API routes
router.get('/instagram/status', getInstagramStatus);
router.get('/instagram/profile', getInstagramProfile);
router.get('/instagram/posts', getInstagramPosts);
router.get('/instagram/conversations', getInstagramConversations);
router.get('/instagram/messages', getInstagramMessages);
router.post('/instagram/send-message', sendInstagramMessage);
router.post('/instagram/create-post', createInstagramPost); // ADD THIS LINE
router.get('/instagram/debug-messaging', debugMessagingAccess);
router.get('/instagram/page-conversations', getPageInstagramConversations);
router.get('/instagram/test-access', testMessagingAccess);
router.get('/instagram/debug', debugInstagramConnections);
router.post('/instagram/create-story', createInstagramStory);
router.get('/instagram/stories', getInstagramStories);
router.post('/instagram/create-story-mention', createStoryWithMention);
router.post('/instagram/clear', clearInstagramConnection);
router.get('/instagram/stories', getInstagramStories);
router.get('/instagram/connections', setInstagramConnection);
router.post('/instagram/get-connection', getInstagramConnection);
router.get('/instagram/insights', getInstagramInsights);
router.get('/instagram/comments', getInstagramComments);





export default router;