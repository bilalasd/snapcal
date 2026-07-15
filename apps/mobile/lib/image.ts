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

/** Resize any local image uri to the upload format (768px wide JPEG + base64).
 *  768px chosen by the bench (WIDTH sweep): ~12% faster analysis, no accuracy
 *  loss. Used for both camera captures and library picks. */
export async function resizeToPhoto(uri: string): Promise<PickedPhoto> {
  const out = await manipulateAsync(uri, [{ resize: { width: 768 } }], {
    compress: 0.8,
    format: SaveFormat.JPEG,
    base64: true,
  });
  return { encoded: { data: out.base64!, media_type: "image/jpeg" }, uri: out.uri };
}

/** Pick up to `limit` photos from the library. */
export async function pickPhotos(limit: number): Promise<PickedPhoto[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    quality: 1,
    allowsMultipleSelection: true,
    selectionLimit: limit,
  });
  if (res.canceled) return [];
  return Promise.all(res.assets.slice(0, limit).map((a) => resizeToPhoto(a.uri)));
}
