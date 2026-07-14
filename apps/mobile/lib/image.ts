import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

export interface EncodedImage {
  data: string; // base64, no data: prefix
  media_type: "image/jpeg";
}

export interface PickedPhoto {
  encoded: EncodedImage;
  uri: string; // resized local file, for preview + upload
}

async function resize(uri: string): Promise<PickedPhoto> {
  // 768px chosen by the bench (scripts/bench-models.ts, WIDTH sweep): ~12%
  // faster analysis than 1024 with no accuracy loss — fewer image tiles for
  // the vision model to process.
  const out = await manipulateAsync(uri, [{ resize: { width: 768 } }], {
    compress: 0.8,
    format: SaveFormat.JPEG,
    base64: true,
  });
  return { encoded: { data: out.base64!, media_type: "image/jpeg" }, uri: out.uri };
}

/** Snap a photo with the camera. Returns null if cancelled/denied. */
export async function takePhoto(): Promise<PickedPhoto | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchCameraAsync({ quality: 1 });
  if (res.canceled || !res.assets[0]) return null;
  return resize(res.assets[0].uri);
}

/** Pick up to `limit` photos from the library. */
export async function pickPhotos(limit: number): Promise<PickedPhoto[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    quality: 1,
    allowsMultipleSelection: true,
    selectionLimit: limit,
  });
  if (res.canceled) return [];
  return Promise.all(res.assets.slice(0, limit).map((a) => resize(a.uri)));
}
