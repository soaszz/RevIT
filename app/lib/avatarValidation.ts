export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp";

const AVATAR_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

function hasBytes(bytes: Uint8Array, offset: number, expected: number[]) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function signatureMatches(type: keyof typeof AVATAR_TYPES, bytes: Uint8Array) {
  if (type === "image/png") return hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (type === "image/jpeg") return hasBytes(bytes, 0, [0xff, 0xd8, 0xff]);
  return hasBytes(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && hasBytes(bytes, 8, [0x57, 0x45, 0x42, 0x50]);
}

export async function validateAvatarFile(file: File) {
  const type = file.type.toLowerCase() as keyof typeof AVATAR_TYPES;
  if (!(type in AVATAR_TYPES)) throw new Error("Choose a PNG, JPG, or WebP image.");
  if (file.size < 12 || file.size > AVATAR_MAX_BYTES) throw new Error("Choose an image smaller than 2 MB.");

  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!signatureMatches(type, bytes)) throw new Error("The selected file does not match its image type.");
  return { contentType: type, extension: AVATAR_TYPES[type] };
}
