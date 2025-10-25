import express from 'express';
import {
  startFacebookAuth,
  facebookCallback,
  startBusinessAuth,
  businessCallback,
  getFacebookPosts,
  getFacebookComments,
  createFacebookPost,
  replyToComment,
   getMockConversations,
  getMockConversationMessages,
  getMockPosts,
  getMockComments,
  getFacebookStatus,
  replyMessage
} from '../controllers/facebookController.js';

const router = express.Router();

// Consumer App Authentication Routes
router.get('/facebook', startFacebookAuth);
router.get('/facebook/callback', facebookCallback);

// Business App Authentication Routes  
router.get('/business', startBusinessAuth);
router.get('/business/callback', businessCallback);

// Facebook Page API Routes
router.get('/posts', getFacebookPosts);
router.get('/comments', getFacebookComments);
router.post('/create-post', createFacebookPost);
router.post('/reply-comment', replyToComment);
router.post('/reply-message', replyMessage);


// --- MOCK endpoints for demo / review ---
router.get('/mock/posts', getMockPosts);
router.get('/mock/status', getFacebookStatus);
router.get('/mock/comments', getMockComments);
router.get('/mock/conversations', getMockConversations);
router.get('/mock/conversations/:id/messages', getMockConversationMessages);



export default router;
