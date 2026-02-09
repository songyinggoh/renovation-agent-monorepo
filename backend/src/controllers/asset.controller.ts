import { Request, Response } from 'express';
import { AssetService } from '../services/asset.service.js';
import { ASSET_TYPES, type AssetType } from '../db/schema/assets.schema.js';
import { Logger } from '../utils/logger.js';
import { NotFoundError, ValidationError, ResourceLimitError } from '../utils/service-errors.js';

const logger = new Logger({ serviceName: 'AssetController' });
const assetService = new AssetService();

/**
 * Request a signed upload URL for a file
 * POST /api/rooms/:roomId/assets/request-upload
 */
export const requestUpload = async (req: Request, res: Response) => {
  const { roomId } = req.params;
  const { filename, contentType, fileSize, assetType } = req.body;

  logger.info('Upload request', { roomId, filename, contentType, fileSize, assetType });

  if (!filename || !contentType || !fileSize || !assetType) {
    return res.status(400).json({
      error: 'filename, contentType, fileSize, and assetType are required',
    });
  }

  if (!ASSET_TYPES.includes(assetType)) {
    return res.status(400).json({
      error: `Invalid assetType. Must be one of: ${ASSET_TYPES.join(', ')}`,
    });
  }

  // Validate fileSize is a finite number
  const fileSizeNum = Number(fileSize);
  if (!Number.isFinite(fileSizeNum) || fileSizeNum <= 0) {
    return res.status(400).json({
      error: 'fileSize must be a positive finite number',
    });
  }

  try {
    const result = await assetService.requestUpload({
      roomId: roomId as string,
      filename,
      contentType,
      fileSize: fileSizeNum,
      assetType: assetType as AssetType,
      uploadedBy: req.user?.id,
    });

    res.status(201).json(result);
  } catch (error) {
    logger.error('Failed to request upload', error as Error, { roomId });

    if (error instanceof NotFoundError) {
      return res.status(404).json({ error: error.message });
    }
    if (error instanceof ValidationError || error instanceof ResourceLimitError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to request upload' });
  }
};

/**
 * Confirm a file upload completed
 * POST /api/rooms/:roomId/assets/:assetId/confirm
 */
export const confirmUpload = async (req: Request, res: Response) => {
  const { assetId } = req.params;

  logger.info('Confirming upload', { assetId });

  try {
    const asset = await assetService.confirmUpload(assetId as string);
    res.json({ asset });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to confirm upload';
    logger.error('Failed to confirm upload', error as Error, { assetId });

    if (message.includes('not found')) {
      return res.status(404).json({ error: message });
    }
    if (message.includes('not pending')) {
      return res.status(409).json({ error: message });
    }
    res.status(500).json({ error: 'Failed to confirm upload' });
  }
};

/**
 * List all assets for a room
 * GET /api/rooms/:roomId/assets
 */
export const listAssets = async (req: Request, res: Response) => {
  const { roomId } = req.params;

  logger.info('Listing assets', { roomId });

  try {
    const assets = await assetService.getAssetsByRoom(roomId as string);
    res.json({ assets });
  } catch (error) {
    logger.error('Failed to list assets', error as Error, { roomId });
    res.status(500).json({ error: 'Failed to retrieve assets' });
  }
};

/**
 * Get a single asset
 * GET /api/rooms/:roomId/assets/:assetId
 */
export const getAsset = async (req: Request, res: Response) => {
  const { assetId } = req.params;

  try {
    const asset = await assetService.getAssetById(assetId as string);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    res.json({ asset });
  } catch (error) {
    logger.error('Failed to get asset', error as Error, { assetId });
    res.status(500).json({ error: 'Failed to retrieve asset' });
  }
};

/**
 * Delete an asset
 * DELETE /api/rooms/:roomId/assets/:assetId
 */
export const deleteAsset = async (req: Request, res: Response) => {
  const { assetId } = req.params;

  logger.info('Deleting asset', { assetId });

  try {
    await assetService.deleteAsset(assetId as string);
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete asset';
    logger.error('Failed to delete asset', error as Error, { assetId });

    if (message.includes('not found')) {
      return res.status(404).json({ error: message });
    }
    res.status(500).json({ error: 'Failed to delete asset' });
  }
};

/**
 * Get a signed download URL for an asset
 * GET /api/rooms/:roomId/assets/:assetId/url
 */
export const getAssetUrl = async (req: Request, res: Response) => {
  const { assetId } = req.params;

  try {
    const url = await assetService.getSignedUrl(assetId as string);
    if (!url) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    res.json({ url });
  } catch (error) {
    logger.error('Failed to get asset URL', error as Error, { assetId });
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
};
