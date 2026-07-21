const cloudinary = require('cloudinary').v2;
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
});

class VisionService {
    /**
     * Upload image to Cloudinary
     * @param {Buffer|string} file - File buffer or base64 string
     * @param {Object} options - Upload options
     * @returns {Promise<Object>} Upload result
     */
    static async uploadToCloudinary(file, options = {}) {
        try {
            if (Buffer.isBuffer(file)) {
                return new Promise((resolve, reject) => {
                    const uploadOptions = {
                        folder: options.folder || 'medvision/scans',
                        resource_type: 'image',
                        tags: options.tags || ['chest-xray', 'medvision'],
                        public_id: options.publicId || uuidv4(),
                        ...options
                    };

                    cloudinary.uploader.upload_stream(
                        uploadOptions,
                        (error, result) => {
                            if (error) {
                                reject(error);
                            } else {
                                resolve({
                                    url: result.secure_url,
                                    publicId: result.public_id,
                                    format: result.format,
                                    size: result.bytes,
                                    width: result.width,
                                    height: result.height,
                                    createdAt: result.created_at,
                                    version: result.version
                                });
                            }
                        }
                    ).end(file);
                });
            } 
            else if (typeof file === 'string' && file.startsWith('data:image')) {
                const result = await cloudinary.uploader.upload(file, {
                    folder: options.folder || 'medvision/scans',
                    tags: options.tags || ['chest-xray', 'medvision'],
                    public_id: options.publicId || uuidv4(),
                    ...options
                });
                
                return {
                    url: result.secure_url,
                    publicId: result.public_id,
                    format: result.format,
                    size: result.bytes,
                    width: result.width,
                    height: result.height,
                    createdAt: result.created_at,
                    version: result.version
                };
            }
            else if (typeof file === 'string' && file.startsWith('http')) {
                const result = await cloudinary.uploader.upload(file, {
                    folder: options.folder || 'medvision/scans',
                    tags: options.tags || ['chest-xray', 'medvision'],
                    public_id: options.publicId || uuidv4(),
                    ...options
                });
                
                return {
                    url: result.secure_url,
                    publicId: result.public_id,
                    format: result.format,
                    size: result.bytes,
                    width: result.width,
                    height: result.height,
                    createdAt: result.created_at,
                    version: result.version
                };
            }
            
            throw new Error('Invalid file format. Must be Buffer, base64, or URL.');
        } catch (error) {
            console.error('Cloudinary upload error:', error);
            throw new Error(`Cloudinary upload failed: ${error.message}`);
        }
    }

    /**
     * Delete image from Cloudinary
     * @param {string} publicId - Cloudinary public ID
     * @returns {Promise<Object>} Delete result
     */
    static async deleteFromCloudinary(publicId) {
        try {
            const result = await cloudinary.uploader.destroy(publicId);
            return { 
                success: result.result === 'ok',
                result 
            };
        } catch (error) {
            console.error('Cloudinary delete error:', error);
            throw new Error(`Cloudinary delete failed: ${error.message}`);
        }
    }

    /**
     * Get optimized Cloudinary URL
     * @param {string} publicId - Cloudinary public ID
     * @param {Object} options - Transformation options
     * @returns {string} Optimized URL
     */
    static getOptimizedUrl(publicId, options = {}) {
        const defaultOptions = {
            width: 800,
            height: 600,
            crop: 'fill',
            quality: 'auto:good',
            format: 'auto',
            dpr: 'auto'
        };

        const params = { ...defaultOptions, ...options };
        const paramsString = Object.entries(params)
            .filter(([_, value]) => value !== undefined && value !== null)
            .map(([key, value]) => `${key}_${value}`)
            .join(',');

        return `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/${paramsString}/${publicId}`;
    }
    static getThumbnailUrl(publicId) {
        return this.getOptimizedUrl(publicId, {
            width: 200,
            height: 200,
            crop: 'thumb',
            gravity: 'face'
        });
    }

    static getPreviewUrl(publicId) {
        return this.getOptimizedUrl(publicId, {
            width: 500,
            height: 400,
            crop: 'fit'
        });
    }

    static getFullSizeUrl(publicId) {
        return this.getOptimizedUrl(publicId, {
            width: 1200,
            height: 900,
            crop: 'fit',
            quality: 'auto:best'
        });
    }

    
    static addWatermark(publicId, watermarkText = 'MedVision AI') {
        return cloudinary.CloudinaryImage(publicId)
            .image({
                transformation: [
                    { width: 800, height: 600, crop: 'fit' },
                    { overlay: new cloudinary.TextLayer()
                        .text(watermarkText)
                        .fontSize(40)
                        .fontWeight('bold')
                        .color('white')
                        .opacity(50)
                        .gravity('south_east')
                        .x(20)
                        .y(20)
                    }
                ]
            });
    }
}

module.exports = VisionService;