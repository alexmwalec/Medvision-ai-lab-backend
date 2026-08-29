const multer = require('multer');
const path = require('path');

const allowedExt = ['.jpg', '.jpeg', '.png', '.dcm', '.dicom'];
// PACS gateways do not consistently send a MIME type. The inference service
// validates DICOM from its contents with pydicom, not from this client value.
const allowedMime = [
  'image/jpeg', 'image/png', 'image/jpg',
  'application/dicom', 'application/dicom+json', 'application/octet-stream'
];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExt.includes(ext) || allowedMime.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type. Please upload JPEG, PNG, or DICOM files.'));
  }
};

const upload = multer({
  // The predict controller forwards req.file.buffer to the inference service
  // and persists the original image after a patient id is created.
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter
});

module.exports = upload;
