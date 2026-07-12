const crypto = require('crypto');
const supabase = require('./supabaseClient');
const { readRawBody, parseMultipart, extractBoundary } = require('./multipart');

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'media';
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_BYTES = 25 * 1024 * 1024;

const IMAGE_UPLOAD_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};
const VIDEO_UPLOAD_TYPES = {
  'video/mp4': '.mp4',
  'video/webm': '.webm'
};

// Parses a multipart/form-data upload request and stores the file in
// Supabase Storage under `${salonSlug}/${filename}`, returning its public URL.
// The bucket must be created and set to "public" once during setup (see DEPLOYMENT.md).
async function readUploadedMedia(req, salonSlug) {
  const boundary = extractBoundary(req.headers['content-type']);
  if (!boundary) throw new Error('Solicitud de archivo inválida.');

  const buffer = await readRawBody(req, MAX_VIDEO_UPLOAD_BYTES);
  const parts = parseMultipart(buffer, boundary);
  const file = parts.find(p => p.name === 'image' && p.filename && p.content.length);
  if (!file) throw new Error('Selecciona un archivo para subir.');

  const imageExt = IMAGE_UPLOAD_TYPES[file.contentType];
  const videoExt = VIDEO_UPLOAD_TYPES[file.contentType];
  const ext = imageExt || videoExt;
  if (!ext) throw new Error('Formato no permitido. Usa JPG, PNG, WEBP, GIF, MP4 o WEBM.');

  const kind = videoExt ? 'video' : 'image';
  const maxBytes = kind === 'video' ? MAX_VIDEO_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
  if (file.content.length > maxBytes) {
    throw new Error(kind === 'video' ? 'El video es muy pesado. Máximo 25 MB.' : 'El archivo es muy pesado. Máximo 6 MB.');
  }

  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  const storagePath = `${salonSlug}/${filename}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file.content, { contentType: file.contentType, upsert: false });

  if (uploadError) throw new Error(`No se pudo subir el archivo: ${uploadError.message}`);

  const { data: publicUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  const url = publicUrlData.publicUrl;

  return { imageUrl: url, url, kind, filename, sizeBytes: file.content.length, contentType: file.contentType };
}

module.exports = { readUploadedMedia };
