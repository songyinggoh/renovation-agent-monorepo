import { Router } from 'express';
import {
  requestUpload,
  confirmUpload,
  listAssets,
  getAsset,
  deleteAsset,
  getAssetUrl,
} from '../controllers/asset.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { verifyRoomOwnership } from '../middleware/ownership.middleware.js';

const router = Router();

// All asset routes require authentication
router.use(authMiddleware);

/**
 * @route POST /api/rooms/:roomId/assets/request-upload
 * @desc Request a signed upload URL for a file
 */
router.post('/rooms/:roomId/assets/request-upload', verifyRoomOwnership, requestUpload);

/**
 * @route POST /api/rooms/:roomId/assets/:assetId/confirm
 * @desc Confirm a file upload completed
 */
router.post('/rooms/:roomId/assets/:assetId/confirm', verifyRoomOwnership, confirmUpload);

/**
 * @route GET /api/rooms/:roomId/assets
 * @desc List all assets for a room
 */
router.get('/rooms/:roomId/assets', verifyRoomOwnership, listAssets);

/**
 * @route GET /api/rooms/:roomId/assets/:assetId
 * @desc Get a single asset
 */
router.get('/rooms/:roomId/assets/:assetId', verifyRoomOwnership, getAsset);

/**
 * @route GET /api/rooms/:roomId/assets/:assetId/url
 * @desc Get a signed download URL for an asset
 */
router.get('/rooms/:roomId/assets/:assetId/url', verifyRoomOwnership, getAssetUrl);

/**
 * @route DELETE /api/rooms/:roomId/assets/:assetId
 * @desc Delete an asset
 */
router.delete('/rooms/:roomId/assets/:assetId', verifyRoomOwnership, deleteAsset);

export default router;
