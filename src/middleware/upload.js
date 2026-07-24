const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const filename = `${uuidv4()}${ext}`;
        cb(null, filename);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/dicom'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.dcm'];

    const ext = path.extname(file.originalname).toLowerCase();
    const isValidType = allowedTypes.includes(file.mimetype);
    const isValidExt = allowedExtensions.includes(ext);

    if (isValidType || isValidExt) {
        cb(null, true);
    } else {
        cb(new Error('Unsupported file type. Please upload JPG, PNG, or DICOM files.'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 
    },
    fileFilter: fileFilter
});

module.exports = upload;