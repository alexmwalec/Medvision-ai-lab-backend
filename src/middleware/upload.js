const multer = require('multer');
const path = require('path');

const allowedExt = ['.jpg', '.jpeg', '.png', '.dcm'];
const allowedMime = ['image/jpeg', 'image/png', 'image/jpg', 'application/dicom'];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExt.includes(ext) || allowedMime.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type. Please upload JPG, PNG, or DICOM files.'));
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
