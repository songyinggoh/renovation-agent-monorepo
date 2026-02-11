import { Request, Response } from 'express';
import { AssetService } from '../services/asset.service.js';
import { ASSET_TYPES, type AssetType } from '../db/schema/assets.schema.js';
import { Logger } from '../utils/logger.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { asyncHandler } from '../utils/async.js';

const logger = new Logger({ serviceName: 'AssetController' });
const assetService = new AssetService();

/**
 * Request a signed upload URL for a file
 * POST /api/rooms/:roomId/assets/request-upload
 */
export const requestUpload = asyncHandler(async (req: Request, res: Response) => {
  const { roomId } = req.params;
  const { filename, contentType, fileSize, assetType, sessionId } = req.body;

  logger.info('Upload request', { roomId, filename, contentType, fileSize, assetType });

  if (!filename || !contentType || !fileSize || !assetType || !sessionId) {
    throw new BadRequestError('filename, contentType, fileSize, assetType, and sessionId are required');
  }

  if (!ASSET_TYPES.includes(assetType)) {
    throw new BadRequestError(`Invalid assetType. Must be one of: ${ASSET_TYPES.join(', ')}`);
  }

  const result = await assetService.requestUpload({
    roomId,
    sessionId,
    filename,
    contentType,
    fileSize: Number(fileSize),
    assetType: assetType as AssetType,
    uploadedBy: req.user?.id,
  });

  res.status(201).json(result);
});

/**
 * Confirm a file upload completed
 * POST /api/rooms/:roomId/assets/:assetId/confirm
 */
export const confirmUpload = asyncHandler(async (req: Request, res: Response) => {
  const { assetId } = req.params;

  logger.info('Confirming upload', { assetId });

  const asset = await assetService.confirmUpload(assetId);
  res.json({ asset });
});

/**
 * List all assets for a room
 * GET /api/rooms/:roomId/assets
 */
export const listAssets = asyncHandler(async (req: Request, res: Response) => {
  const { roomId } = req.params;

  logger.info('Listing assets', { roomId });

  const assets = await assetService.getAssetsByRoom(roomId);
  res.json({ assets });
});

/**
 * Get a single asset
 * GET /api/rooms/:roomId/assets/:assetId
 */
export const getAsset = asyncHandler(async (req: Request, res: Response) => {
  const { assetId } = req.params;

  const asset = await assetService.getAssetById(assetId);
  if (!asset) {
    throw new NotFoundError('Asset not found');
  }
  res.json({ asset });
});

/**
 * Delete an asset
 * DELETE /api/rooms/:roomId/assets/:assetId
 */
export const deleteAsset = asyncHandler(async (req: Request, res: Response) => {
  const { assetId } = req.params;

  logger.info('Deleting asset', { assetId });

  await assetService.deleteAsset(assetId);
  res.status(204).send();
});

/**
 * Get a signed download URL for an asset
 * GET /api/rooms/:roomId/assets/:assetId/url
 */
export const getAssetUrl = asyncHandler(async (req: Request, res: Response) => {
  const { assetId } = req.params;

  const url = await assetService.getSignedUrl(assetId);
  if (!url) {
    throw new NotFoundError('Asset not found');
  }
  res.json({ url });
});
