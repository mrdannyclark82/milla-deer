import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

const audioStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = 'memory/audio_messages/';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, uuidv4() + '.webm');
  },
});

export const upload = multer({ storage: audioStorage });

// General file upload — stored in memory (buffer), max 20MB
// Accepts: images, PDFs, text files, code files, JSON, CSV
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'text/plain', 'text/csv', 'text/markdown',
  'application/pdf',
  'application/json',
  'text/javascript', 'text/typescript', 'text/x-python',
  'application/x-python-code',
]);

export const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = new Set([
      '.jpg', '.jpeg', '.png', '.gif', '.webp',
      '.txt', '.md', '.csv', '.json', '.pdf',
      '.js', '.ts', '.tsx', '.jsx', '.py', '.sh', '.yaml', '.yml',
    ]);
    if (ALLOWED_MIME_TYPES.has(file.mimetype) || allowedExts.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});
